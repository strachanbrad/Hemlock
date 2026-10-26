' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

sub init()
    m.codeFirst = m.top.FindNode("codeFirst")
    m.codeSecond = m.top.FindNode("codeSecond")
    m.statusText = m.top.FindNode("statusText")
    m.addressText = m.top.FindNode("addressText")
    m.digits = CreateObject("roRegex", "\D", "")
end sub

sub render()
    digits = m.digits.ReplaceAll(m.top.code, "")
    if Len(digits) = 6
        m.codeFirst.text = Left(digits, 3)
        m.codeSecond.text = Right(digits, 3)
    else
        m.codeFirst.text = "···"
        m.codeSecond.text = "···"
    end if
    m.statusText.text = m.top.status
    m.addressText.text = "Hemlock at " + m.top.address
end sub
