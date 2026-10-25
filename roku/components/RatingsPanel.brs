' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' The rows in the order Up and Down move through them; `highlight` names one by its field.
sub init()
    m.rowHeight = 46
    m.rowGap = 6
    m.rows = {}
    specs = [
        { field: "read", label: "READ" },
        { field: "star_rating", label: "STARS", icon: "star", tint: "0xC9A86AFF" },
        { field: "spice_rating", label: "SPICE", icon: "chilli", tint: "0xB5582CFF" },
        { field: "gore_rating", label: "GORE", icon: "knife", tint: "0xC98B8BFF" },
    ]
    for i = 0 to specs.Count() - 1
        spec = specs[i]
        row = m.top.CreateChild("Group")
        row.translation = [0, i * (m.rowHeight + m.rowGap)]
        wash = row.CreateChild("Rectangle")
        wash.width = 470
        wash.height = m.rowHeight
        wash.color = "0xC9A86A2E"
        wash.visible = false
        bar = row.CreateChild("Rectangle")
        bar.width = 4
        bar.height = m.rowHeight
        bar.color = "0xC9A86AFF"
        bar.visible = false
        label = row.CreateChild("Label")
        label.translation = [20, 0]
        label.width = 130
        label.height = m.rowHeight
        label.vertAlign = "center"
        label.color = "0xC9A86AFF"
        label.font = fontOf("pkg:/fonts/Inter-SemiBold.ttf", 20)
        label.text = spec.label
        icons = []
        state = invalid
        if spec.field = "read"
            icons.Push(iconOf(row, 160))
            state = row.CreateChild("Label")
            state.translation = [208, 0]
            state.height = m.rowHeight
            state.vertAlign = "center"
            state.font = fontOf("pkg:/fonts/Inter-Regular.ttf", 24)
        else
            for j = 0 to 4
                icons.Push(iconOf(row, 160 + j * 44))
            end for
        end if
        m.rows[spec.field] = { spec: spec, wash: wash, bar: bar, icons: icons, state: state }
    end for
    m.top.rowsHeight = specs.Count() * m.rowHeight + (specs.Count() - 1) * m.rowGap
end sub

function iconOf(row as Object, x as Integer) as Object
    icon = row.CreateChild("Poster")
    icon.translation = [x, 5]
    icon.width = 36
    icon.height = 36
    return icon
end function

function fontOf(uri as String, size as Integer) as Object
    font = CreateObject("roSGNode", "Font")
    font.uri = uri
    font.size = size
    return font
end function

sub render()
    book = m.top.book
    if book = invalid then return
    for each field in m.rows
        row = m.rows[field]
        on = m.top.highlight = field
        row.wash.visible = on
        row.bar.visible = on
        if field = "read"
            read = book.read = true
            if read
                row.icons[0].uri = "pkg:/images/book-open.png"
                row.icons[0].blendColor = "0x7F9B7AFF"
                row.state.text = "Read"
                row.state.color = "0xEFE6DAFF"
            else
                row.icons[0].uri = "pkg:/images/book-closed.png"
                row.icons[0].blendColor = "0x7F7079FF"
                row.state.text = "Not read"
                row.state.color = "0xB8A9A0FF"
            end if
        else
            value = ratingOf(book[field])
            for j = 0 to 4
                icon = row.icons[j]
                if j < value
                    icon.uri = "pkg:/images/" + row.spec.icon + "-filled.png"
                    icon.blendColor = row.spec.tint
                else
                    icon.uri = "pkg:/images/" + row.spec.icon + "-empty.png"
                    icon.blendColor = "0x7F7079FF"
                end if
            end for
        end if
    end for
end sub
