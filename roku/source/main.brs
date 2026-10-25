' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)
    screen.CreateScene("HemlockScene")
    screen.Show()
    appManager = CreateObject("roAppManager")
    print "[hemlock] screensaver wait " + appManager.GetScreensaverTimeout().ToStr() + " minutes"
    ' The TV's screensaver covers and suspends a channel that plays no video once its wait time passes without a
    ' key press; marking a key press each minute holds it off while the slideshow runs.
    while true
        msg = Wait(60000, port)
        if msg = invalid
            appManager.UpdateLastKeyPressTime()
        else if type(msg) = "roSGScreenEvent" and msg.IsScreenClosed()
            return
        end if
    end while
end sub
