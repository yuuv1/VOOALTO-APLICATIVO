Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
rootDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = rootDir
shell.Run Chr(34) & rootDir & "\Iniciar_Sistema_Vooalto.bat" & Chr(34), 0, False
