' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

sub init()
    m.filters = ["owned", "all", "read", "unread"]
    m.filterNames = { owned: "Owned books", all: "All books", read: "Read books", unread: "Unread books" }
    m.secondsChoices = [5, 10, 15, 20, 30, 45, 60, 120, 300]
    m.hints = [
        "OK changes the address. Back saves and closes.",
        "Left and Right choose which books show. Back saves and closes.",
        "Left and Right change the seconds per book. Back saves and closes.",
    ]
    m.hint = m.top.FindNode("hint")
    m.rows = []
    rows = m.top.FindNode("rows")
    labels = ["HEMLOCK ADDRESS", "BOOKS", "SECONDS PER BOOK"]
    for i = 0 to labels.Count() - 1
        row = rows.CreateChild("Group")
        row.translation = [0, i * 100]
        wash = row.CreateChild("Rectangle")
        wash.width = 960
        wash.height = 88
        wash.color = "0xC9A86A2E"
        bar = row.CreateChild("Rectangle")
        bar.width = 4
        bar.height = 88
        bar.color = "0xC9A86AFF"
        label = row.CreateChild("Label")
        label.translation = [24, 10]
        label.color = "0xC9A86AFF"
        label.font = fontOf("pkg:/fonts/Inter-SemiBold.ttf", 20)
        label.text = labels[i]
        value = row.CreateChild("Label")
        value.translation = [24, 38]
        value.width = 912
        value.color = "0xEFE6DAFF"
        value.font = fontOf("pkg:/fonts/Inter-Regular.ttf", 32)
        m.rows.Push({ wash: wash, bar: bar, value: value })
    end for
    m.focus = 0
    m.dialog = invalid
end sub

function fontOf(uri as String, size as Integer) as Object
    font = CreateObject("roSGNode", "Font")
    font.uri = uri
    font.size = size
    return font
end function

sub onValues()
    m.values = m.top.values
    m.focus = 0
    render()
end sub

sub render()
    m.rows[0].value.text = m.values.base
    m.rows[1].value.text = m.filterNames[m.values.filter]
    m.rows[2].value.text = m.values.seconds.ToStr()
    for i = 0 to m.rows.Count() - 1
        m.rows[i].wash.visible = i = m.focus
        m.rows[i].bar.visible = i = m.focus
    end for
    m.hint.text = m.hints[m.focus]
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return true
    if key = "up" and m.focus > 0
        m.focus = m.focus - 1
    else if key = "down" and m.focus < m.rows.Count() - 1
        m.focus = m.focus + 1
    else if key = "OK" and m.focus = 0
        editAddress()
    else if key = "left" or key = "right"
        delta = 1
        if key = "left" then delta = -1
        if m.focus = 1 then m.values.filter = cycle(m.filters, m.values.filter, delta)
        if m.focus = 2 then m.values.seconds = cycle(m.secondsChoices, m.values.seconds, delta)
    else if key = "back" or key = "options"
        m.top.result = m.values
        return true
    end if
    render()
    return true
end function

function cycle(choices as Object, current as Dynamic, delta as Integer) as Dynamic
    index = 0
    for i = 0 to choices.Count() - 1
        if choices[i] = current then index = i
    end for
    n = choices.Count()
    return choices[(((index + delta) mod n) + n) mod n]
end function

sub editAddress()
    dialog = CreateObject("roSGNode", "StandardKeyboardDialog")
    dialog.title = "Hemlock address"
    dialog.message = ["The address the TV reaches Hemlock at, such as http://10.0.5.10"]
    dialog.text = m.values.base
    dialog.buttons = ["Save", "Cancel"]
    palette = CreateObject("roSGNode", "RSGPalette")
    palette.colors = {
        DialogBackgroundColor: "0x262030FF",
        DialogTextColor: "0xEFE6DAFF",
        DialogSecondaryTextColor: "0xB8A9A0FF",
        DialogSecondaryItemColor: "0xC9A86A80",
        DialogFocusColor: "0x89023EFF",
        DialogFocusItemColor: "0xEFE6DAFF",
        DialogFootprintColor: "0x74656FFF",
        DialogInputFieldColor: "0x1D1922FF",
        DialogKeyboardColor: "0x1D1922FF",
    }
    dialog.palette = palette
    dialog.ObserveField("buttonSelected", "onAddressButton")
    dialog.ObserveField("wasClosed", "onAddressClosed")
    m.dialog = dialog
    m.top.GetScene().dialog = dialog
end sub

sub onAddressButton()
    if m.dialog = invalid then return
    if m.dialog.buttonSelected = 0
        base = cleanBase(m.dialog.text)
        if base = ""
            m.dialog.message = ["Start the address with http:// or https://, such as http://10.0.5.10"]
            return
        end if
        m.values.base = base
        render()
    end if
    m.dialog.close = true
end sub

sub onAddressClosed()
    m.dialog = invalid
    m.top.SetFocus(true)
end sub
