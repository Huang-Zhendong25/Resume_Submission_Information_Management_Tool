# -*- coding: utf-8 -*-
"""
投递管理（Delivery Tracker）· 本地服务

一个轻量级的投递记录管理工具：启动后在浏览器中打开界面，
可增删改企业投递记录，并把数据同步到指定的 Excel 文件（或不指定文件、仅内存运行）。

依赖：Python 3.8+，openpyxl（见 requirements.txt）。
用法：python app.py   （首次使用请先 pip install -r requirements.txt）
"""
import os
import sys
import json
import re
import socket
import shutil
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print('缺少依赖 openpyxl，请先运行：pip install -r requirements.txt')
    raise SystemExit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
SETTINGS_PATH = os.environ.get('TDGL_SETTINGS') or os.path.join(BASE_DIR, 'settings.json')

STATUSES = ["线下投递", "申请", "已投递", "待处理", "初筛", "评估中", "部门筛选", "测评/笔试", "面试", "等待offer", "意向"]
REASONS = ["简历筛选不通过", "测评未通过", "笔试未通过", "一轮面试未通过", "二轮面试未通过", "HR面试未通过", "长时间无状态更新", "投递方式错误"]
SECTION_NAMES = {"准备", "已投", "线下投递"}

DEFAULT_SETTINGS = {
    'fontScale': 100,
    'bgType': 'solid',
    'bgSolid': '#f3f5fa',
    'bgGradA': '#e8f0fe',
    'bgGradB': '#f3e8ff',
    'remarkBg': '#eef2ff',
    'sort': 'asc',
    'dataPath': '',
}


# ---------------- 设置 ----------------
def sanitize_settings(data):
    d = dict(DEFAULT_SETTINGS)
    if isinstance(data, dict):
        for k in DEFAULT_SETTINGS:
            if k in data:
                d[k] = data[k]
    try:
        d['fontScale'] = int(d['fontScale'])
    except Exception:
        d['fontScale'] = DEFAULT_SETTINGS['fontScale']
    d['fontScale'] = max(90, min(150, d['fontScale']))
    if d['bgType'] not in ('solid', 'gradient'):
        d['bgType'] = DEFAULT_SETTINGS['bgType']
    if d['sort'] not in ('asc', 'desc'):
        d['sort'] = DEFAULT_SETTINGS['sort']
    for key in ('bgSolid', 'bgGradA', 'bgGradB', 'remarkBg'):
        v = d.get(key)
        if not isinstance(v, str) or not re.match(r'^#[0-9a-fA-F]{6}$', v):
            d[key] = DEFAULT_SETTINGS[key]
    d['dataPath'] = str(d.get('dataPath') or '').strip()
    return d


def default_data_path():
    return os.path.join(BASE_DIR, 'data', '投递.xlsx')


def load_settings():
    try:
        with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = {}
    return sanitize_settings(data)


def save_settings(data):
    s = sanitize_settings(data)
    try:
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(s, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return s


def resolve_data_path():
    p = load_settings().get('dataPath') or ''
    p = p.strip()
    return p or default_data_path()


# ---------------- 日期解析 ----------------
def to_month(v):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 12 else None


def to_day(v):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 31 else None


def parse_legacy_date(v):
    if v is None:
        return (None, None)
    if isinstance(v, bool):
        return (None, None)
    if isinstance(v, (int, float)):
        m = int(v)
        frac = round((v - m) * 100)
        if 1 <= m <= 12 and 1 <= frac <= 31:
            return (m, frac)
        return (None, None)
    if isinstance(v, datetime):
        return (v.month, v.day)
    if isinstance(v, str):
        mm = re.search(r'(\d{1,2})\s*月\s*(\d{1,2})', v)
        if mm:
            return (to_month(mm.group(1)), to_day(mm.group(2)))
        mm = re.search(r'(\d{1,2})[./\-](\d{1,2})', v)
        if mm:
            return (to_month(mm.group(1)), to_day(mm.group(2)))
    return (None, None)


# ---------------- 旧表状态 -> 状态链 ----------------
def map_token(tok):
    t = re.sub(r'^\d{1,2}\.\d{1,2}', '', tok).strip()
    if not t:
        return None
    tl = t.lower()
    if any(k in t for k in ['线下投递', '线下']):
        return '线下投递'
    if any(k in tl for k in ['offer', 'oc', 'waiting', 'wait']):
        return '等待offer'
    if any(k in t for k in ['测评', '笔试']):
        return '测评/笔试'
    if any(k in t for k in ['面试', '初试', '复试', '一面', '二面']):
        return '面试'
    if any(k in t for k in ['部门', '用人部门', '业务筛选', 'hr筛选', 'hr筛']):
        return '部门筛选'
    if ('评估' in t) or ('consideration' in tl) or ('under' in tl):
        return '评估中'
    if any(k in t for k in ['初筛', '筛选', '筛选中', '查阅']):
        return '初筛'
    if '待处理' in t:
        return '待处理'
    if '申请' in t:
        return '申请'
    if any(k in t for k in ['已投递', '投递', '已投']):
        return '已投递'
    if any(k in t for k in ['储备', '人才库', '意向']):
        return '意向'
    return None


def map_status_text(text):
    if text is None:
        return []
    s = str(text)
    s = s.replace('->', '|').replace('→', '|').replace('=>', '|')
    s = re.sub(r'[/／、，,；;]+', '|', s)
    tokens = [t.strip() for t in s.split('|') if t and t.strip()]
    result = []
    for tok in tokens:
        mapped = map_token(tok)
        if mapped and (not result or result[-1] != mapped):
            result.append(mapped)
    return result


# ---------------- 读取 ----------------
def load_legacy(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    active = []
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=6):
        vals = [c.value for c in row]
        name = vals[0]
        if name is None:
            continue
        name = str(name).strip()
        if not name:
            continue
        others = [v for v in vals[1:6] if v is not None and str(v).strip() != '']
        if name in SECTION_NAMES and not others:
            continue
        month, day = parse_legacy_date(vals[1])
        active.append({
            'name': name,
            'month': month,
            'day': day,
            'statuses': map_status_text(vals[2]),
            'position': str(vals[3]).strip() if vals[3] is not None else '',
            'url': str(vals[4]).strip() if vals[4] is not None else '',
            'remark': '',
            'focus': False,
            'focusNote': '',
            'reason': None,
        })
    wb.close()
    return active


def load_canonical(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb['投递'] if '投递' in wb.sheetnames else wb.worksheets[0]
    active = []
    idle = []
    eliminated = []
    cur = None
    colmap = None

    def getc(row, label):
        i = colmap.get(label)
        if i is None or i >= len(row):
            return None
        return row[i].value

    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=10):
        a = row[0].value
        if a is not None:
            a_s = str(a).strip()
            if a_s.startswith('未淘汰'):
                cur = 'active'
                colmap = None
                continue
            if a_s.startswith('长期无状态更新'):
                cur = 'idle'
                colmap = None
                continue
            if a_s.startswith('已淘汰'):
                cur = 'eliminated'
                colmap = None
                continue
        if cur is None:
            continue
        if colmap is None:
            colmap = {}
            for idx, c in enumerate(row):
                if c.value is not None:
                    colmap[str(c.value).strip()] = idx
            continue
        name = a
        if name is None or not str(name).strip():
            continue
        month, day = parse_legacy_date(getc(row, '投递时间'))
        statuses = []
        sv = getc(row, '投递状态')
        if sv:
            statuses = [x.strip() for x in str(sv).split('→') if x.strip()]
        remark = getc(row, '备注')
        reason = getc(row, '淘汰原因')
        focus_val = getc(row, '重点关注')
        focus = False
        if focus_val is not None:
            focus = str(focus_val).strip() in ('★', '是', '1', '重点关注', 'true', 'True')
        focus_note = getc(row, '重点标签')
        item = {
            'name': str(name).strip(),
            'month': month,
            'day': day,
            'statuses': statuses,
            'position': str(getc(row, '投递岗位')).strip() if getc(row, '投递岗位') is not None else '',
            'url': str(getc(row, '网址')).strip() if getc(row, '网址') is not None else '',
            'remark': str(remark).strip() if remark is not None else '',
            'focus': focus,
            'focusNote': str(focus_note).strip() if focus_note is not None else '',
            'reason': str(reason).strip() if reason is not None and str(reason).strip() else None,
        }
        if cur == 'eliminated':
            eliminated.append(item)
        elif cur == 'idle':
            idle.append(item)
        else:
            active.append(item)
    wb.close()
    return active, idle, eliminated


def load_data_from_path(path):
    if not os.path.exists(path):
        return [], [], []
    wb = openpyxl.load_workbook(path, data_only=True)
    is_canonical = False
    if '投递' in wb.sheetnames:
        v = wb['投递'].cell(row=1, column=1).value
        is_canonical = isinstance(v, str) and v.startswith('未淘汰')
    wb.close()
    if is_canonical:
        return load_canonical(path)
    active = load_legacy(path)
    backup = os.path.splitext(path)[0] + '_备份_原始.xlsx'
    if not os.path.exists(backup):
        try:
            shutil.copy2(path, backup)
        except Exception:
            pass
    try:
        write_canonical(active, [], [], path)
    except Exception:
        pass
    return active, [], []


def load_data():
    path = resolve_data_path()
    if not os.path.exists(path):
        write_canonical([], [], [], path)
        return [], [], []
    return load_data_from_path(path)


# ---------------- 写入 ----------------
def fmt_date(it):
    m = it.get('month')
    d = it.get('day')
    if m and d:
        return '%d月%d日' % (m, d)
    if m:
        return '%d月' % m
    return ''


def write_canonical(active, idle, eliminated, path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '投递'

    thin = Side(style='thin', color='E5E7EB')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    title_font = Font(name='微软雅黑', size=12, bold=True, color='1F2937')
    head_font = Font(name='微软雅黑', size=10, bold=True, color='374151')
    cell_font = Font(name='微软雅黑', size=10, color='1F2937')
    link_font = Font(name='微软雅黑', size=10, color='2563EB', underline='single')
    reason_font = Font(name='微软雅黑', size=10, bold=True, color='B91C1C')
    focus_font = Font(name='微软雅黑', size=10, bold=True, color='B45309')
    active_fill = PatternFill('solid', fgColor='DBEAFE')
    idle_fill = PatternFill('solid', fgColor='FEF3C7')
    elim_fill = PatternFill('solid', fgColor='FEE2E2')
    head_fill = PatternFill('solid', fgColor='F3F4F6')
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left = Alignment(horizontal='left', vertical='center', wrap_text=True)

    headers = ['企业名称', '投递时间', '投递状态', '投递岗位', '网址', '备注', '重点关注', '重点标签', '淘汰原因']
    widths = [20, 11, 44, 34, 40, 26, 10, 26, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    def write_section(start_row, title, fill, items, is_elim):
        r = start_row
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
        c = ws.cell(row=r, column=1, value=title)
        c.font = title_font
        for col in range(1, 10):
            ws.cell(row=r, column=col).fill = fill
        r += 1
        for col, h in enumerate(headers, 1):
            cc = ws.cell(row=r, column=col, value=h)
            cc.font = head_font
            cc.fill = head_fill
            cc.alignment = center
            cc.border = border
        r += 1
        for it in items:
            vals = [
                it.get('name', ''),
                fmt_date(it),
                ' → '.join(it.get('statuses', [])),
                it.get('position', ''),
                it.get('url', ''),
                it.get('remark', ''),
                '★' if it.get('focus') else '',
                it.get('focusNote', ''),
                it.get('reason') or '',
            ]
            for col, v in enumerate(vals, 1):
                cc = ws.cell(row=r, column=col, value=v)
                cc.font = cell_font
                cc.alignment = left
                cc.border = border
            url = it.get('url')
            if url:
                uc = ws.cell(row=r, column=5)
                uc.hyperlink = url
                uc.font = link_font
            if it.get('focus'):
                ws.cell(row=r, column=7).font = focus_font
            if is_elim:
                ws.cell(row=r, column=9).font = reason_font
            r += 1
        return r

    r = write_section(1, '未淘汰（进行中）', active_fill, active, False)
    r += 1
    r = write_section(r, '长期无状态更新', idle_fill, idle, False)
    r += 1
    write_section(r, '已淘汰', elim_fill, eliminated, True)
    ws.freeze_panes = 'A3'
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    wb.save(path)


# ---------------- API ----------------
def with_ids(active, idle, eliminated):
    return {
        'active': [dict(it, id='a%d' % i) for i, it in enumerate(active)],
        'idle': [dict(it, id='i%d' % i) for i, it in enumerate(idle)],
        'eliminated': [dict(it, id='e%d' % i) for i, it in enumerate(eliminated)],
    }


def clean_item(it):
    name = str(it.get('name', '')).strip()
    statuses = []
    for s in (it.get('statuses') or []):
        if s in STATUSES and s not in statuses:
            statuses.append(s)
    reason = it.get('reason')
    reason = reason if reason in REASONS else None
    return {
        'name': name,
        'month': to_month(it.get('month')),
        'day': to_day(it.get('day')),
        'statuses': statuses,
        'position': str(it.get('position', '')).strip(),
        'url': str(it.get('url', '')).strip(),
        'remark': str(it.get('remark', '')).strip(),
        'focus': bool(it.get('focus')),
        'focusNote': str(it.get('focusNote', '')).strip(),
        'reason': reason,
    }


def api_data():
    active, idle, eliminated = load_data()
    s = load_settings()
    return dict(
        with_ids(active, idle, eliminated),
        statuses=STATUSES,
        reasons=REASONS,
        dataPath=s.get('dataPath', ''),
    )


def api_save(body):
    active = [clean_item(it) for it in (body.get('active') or [])]
    idle = [clean_item(it) for it in (body.get('idle') or [])]
    eliminated = [clean_item(it) for it in (body.get('eliminated') or [])]
    active = [it for it in active if it['name']]
    idle = [it for it in idle if it['name']]
    eliminated = [it for it in eliminated if it['name']]
    path = resolve_data_path()
    try:
        write_canonical(active, idle, eliminated, path)
        return {'ok': True, 'saved': True}
    except PermissionError:
        return {'ok': False, 'error': '无法写入数据文件，请先关闭 Excel/WPS 中打开的该文件。'}
    except Exception as exc:
        return {'ok': False, 'error': '保存失败：%s' % exc}


def api_settings_get():
    return dict(load_settings())


def pick_file_dialog():
    if os.name != 'nt':
        return {'ok': False, 'error': '文件选择仅支持 Windows 系统'}
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as e:
        return {'ok': False, 'error': '当前 Python 未安装 tkinter，请手动输入路径：%s' % e}
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        initial = os.path.dirname(resolve_data_path()) or BASE_DIR
        if not os.path.isdir(initial):
            initial = BASE_DIR
        path = filedialog.askopenfilename(
            title='选择投递记录 Excel 文件',
            initialdir=initial,
            filetypes=[('Excel 文件', '*.xlsx'), ('所有文件', '*.*')],
        )
        root.destroy()
        return {'ok': True, 'path': path or ''}
    except Exception as e:
        return {'ok': False, 'error': '打开文件选择框失败：%s' % e}


# ---------------- HTTP ----------------
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/', '/index.html'):
            return self._serve_file(os.path.join(STATIC_DIR, 'index.html'), 'text/html')
        if path == '/style.css':
            return self._serve_file(os.path.join(STATIC_DIR, 'style.css'), 'text/css')
        if path == '/app.js':
            return self._serve_file(os.path.join(STATIC_DIR, 'app.js'), 'application/javascript')
        if path == '/api/data':
            return self._serve_json(api_data())
        if path == '/api/settings':
            return self._serve_json(api_settings_get())
        self.send_error(404)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/save':
            return self._serve_json(api_save(self._read_json()))
        if path == '/api/pickfile':
            return self._serve_json(pick_file_dialog())
        if path == '/api/settings':
            return self._serve_json(save_settings(self._read_json()))
        self.send_error(404)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length).decode('utf-8')
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _serve_file(self, path, ctype):
        try:
            with open(path, 'rb') as f:
                content = f.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', ctype + '; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def _serve_json(self, obj):
        content = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt, *args):
        pass


def find_free_port(start=8765):
    for p in range(start, start + 100):
        with socket.socket() as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue
    return 8765


def main():
    port = find_free_port()
    httpd = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    url = 'http://127.0.0.1:%d/' % port
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    print('投递管理已启动：%s' % url)
    print('关闭本窗口即可退出程序。')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()