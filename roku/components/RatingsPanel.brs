' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' Four rows, in the order Up and Down move through them: the book glyph with Read or Not read, then five stars,
' chillies or knives filled to the rating.
sub init()
    m.rows = {}
    specs = [
        { field: "read", label: "READ" },
        { field: "star_rating", label: "STARS", icon: "star", tint: "0xC9A86AFF" },
        { field: "spice_rating", label: "SPICE", icon: "chilli", tint: "0xB5582CFF" },
        { field: "gore_rating", label: "GORE", icon: "knife", tint: "0xC98B8BFF" },
    ]
    rows = m.top.FindNode("rows")
    for i = 0 to specs.Count() - 1
        spec = specs[i]
        row = rows.CreateChild("Group")
        row.translation = [2, i * 64]
        wash = rectangle(row, 985, "0xC9A86A2E")
        bar = rectangle(row, 4, "0xC9A86AFF")
        label = row.CreateChild("Label")
        label.translation = [28, 0]
        label.width = 150
        label.height = 56
        label.vertAlign = "center"
        label.color = "0xC9A86AFF"
        label.font = fontOf("pkg:/fonts/Inter-SemiBold.ttf", 20)
        label.text = spec.label
        icons = []
        state = invalid
        if spec.field = "read"
            icons.Push(iconOf(row, 190))
            state = row.CreateChild("Label")
            state.translation = [238, 0]
            state.height = 56
            state.vertAlign = "center"
            state.font = fontOf("pkg:/fonts/Inter-Regular.ttf", 26)
        else
            for j = 0 to 4
                icons.Push(iconOf(row, 190 + j * 50))
            end for
        end if
        m.rows[spec.field] = { spec: spec, wash: wash, bar: bar, icons: icons, state: state }
    end for
end sub

function rectangle(row as Object, width as Integer, color as String) as Object
    node = row.CreateChild("Rectangle")
    node.width = width
    node.height = 56
    node.color = color
    return node
end function

function iconOf(row as Object, x as Integer) as Object
    icon = row.CreateChild("Poster")
    icon.translation = [x, 8]
    icon.width = 40
    icon.height = 40
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
            if book.read = true
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
