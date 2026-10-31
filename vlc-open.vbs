Set args = WScript.Arguments
If args.Count > 0 Then
    url = args(0)
    If Left(LCase(url), 6) = "vlc://" Then
        url = Mid(url, 7)
    End If
    Set sh = CreateObject("WScript.Shell")
    sh.Run """C:\Program Files\VideoLAN\VLC\vlc.exe"" """ & url & """", 1, False
End If

