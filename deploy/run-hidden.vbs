' Runs a command with NO window at all and waits for it, passing its exit code on.
'
'   wscript.exe //B //Nologo run-hidden.vbs <program> [args...]
'
' Why this exists: Task Scheduler starting powershell.exe / node.exe opens a
' console window. On Windows 11 with Windows Terminal as the default terminal
' that becomes a visible terminal popup - a brief flash for every periodic task
' (even with -WindowStyle Hidden, which only hides it after it has appeared),
' and a permanent window for long-running workers. wscript.exe is a GUI-subsystem
' host, so it never creates a console, and WshShell.Run with window style 0
' starts the child hidden from the first moment.
Option Explicit

Dim shell, i, arg, cmd
Set shell = CreateObject("WScript.Shell")

cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  ' WScript strips the quotes it was given; put them back where a space needs them.
  If InStr(arg, " ") > 0 Or Len(arg) = 0 Then arg = """" & arg & """"
  cmd = cmd & " " & arg
Next

' 0 = hidden window, True = wait. The return value becomes this script's exit code.
WScript.Quit shell.Run(Trim(cmd), 0, True)
