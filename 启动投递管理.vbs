' Delivery Tracker - launch without a console window
Option Explicit

Dim fso, shell, dir, ex1, ex2
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir

' 1. Check dependency (openpyxl) quietly
Set ex1 = shell.Exec("python -c ""import openpyxl""")
Do While ex1.Status = 0
    WScript.Sleep 50
Loop

If ex1.ExitCode <> 0 Then
    ' 2. Install dependency quietly
    Set ex2 = shell.Exec("python -m pip install -r requirements.txt")
    Do While ex2.Status = 0
        WScript.Sleep 50
    Loop
    If ex2.ExitCode <> 0 Then
        MsgBox "Failed to install dependencies. Please run install_deps.bat manually.", 16, "Delivery Tracker"
        WScript.Quit 1
    End If
End If

' 3. Launch the app (hidden, no console)
shell.Run "pythonw app.py", 0, False