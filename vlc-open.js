var shell = new ActiveXObject("WScript.Shell");
var args = WScript.Arguments;
if (args.length > 0) {
    var raw = "" + args(0);
    // Remove vlc:// or vlc:
    raw = raw.replace(/^vlc:\/\//i, "").replace(/^vlc:/i, "");
    
    // Decode percent-encoded characters once (resolves %2F to / and %3A to :)
    try {
        raw = decodeURIComponent(raw);
    } catch(e) {}
    
    // Fix protocol if slashes/colons were stripped by browser
    raw = raw.replace(/^http:\/\//i, "http://");
    raw = raw.replace(/^https:\/\//i, "https://");
    raw = raw.replace(/^http\/\//i, "http://");
    raw = raw.replace(/^https\/\//i, "https://");
    raw = raw.replace(/^http\//i, "http://");
    raw = raw.replace(/^https\//i, "https://");
    
    if (!raw.match(/^https?:\/\//i)) {
        raw = "http://" + raw;
    }

    // Ensure all spaces in the URL path are encoded as %20 for VLC's HTTP parser
    raw = raw.replace(/ /g, "%20");
    
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var vlcPath = "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe";
    if (!fso.FileExists(vlcPath)) {
        vlcPath = "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe";
    }
    shell.Run('"' + vlcPath + '" "' + raw + '"', 1, false);
}
