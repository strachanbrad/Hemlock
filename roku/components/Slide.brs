' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' Stage geometry at 1920x1080: the cover box is 605x907 at (115, 86); the text column is 989 wide at x 816.
sub init()
    m.boxHeight = 907
    m.body = m.top.FindNode("body")
    m.cloth = m.top.FindNode("cloth")
    m.clothTitle = m.top.FindNode("clothTitle")
    m.clothUmbel = m.top.FindNode("clothUmbel")
    m.poster = m.top.FindNode("poster")
    m.poster.ObserveField("loadStatus", "onCoverStatus")
    m.text = m.top.FindNode("text")
    m.title = m.top.FindNode("title")
    m.author = m.top.FindNode("author")
    m.meta = m.top.FindNode("meta")
    m.ratings = m.top.FindNode("ratings")
    m.synopsis = m.top.FindNode("synopsis")
    m.fade = m.top.FindNode("fade")
    m.fadeTo = m.top.FindNode("fadeTo")
    m.uri = invalid
    m.frame = m.top.FindNode("frame")
    m.blood = m.top.FindNode("blood")
    m.chilli = m.top.FindNode("chilli")
    m.effectsFade = m.top.FindNode("effectsFade")
    m.face = invalid

    probe = m.top.FindNode("probe")
    probe.text = "A"
    m.firstLine = probe.BoundingRect().height
    probe.text = "A" + Chr(10) + "A"
    m.lineStep = probe.BoundingRect().height - m.firstLine
    m.formats = { hardcover: "HARDCOVER", paperback: "PAPERBACK", ebook: "EBOOK" }
end sub

sub onBook()
    book = m.top.book
    if book = invalid then return
    title = textOf(book.title)
    m.title.text = title
    m.author.text = textOf(book.author)
    format = m.formats[textOf(book.format)]
    if format = invalid then format = ""
    m.meta.text = format
    m.synopsis.text = textOf(book.synopsis)
    m.ratings.book = { read: book.read = true, star_rating: book.star_rating, spice_rating: book.spice_rating, gore_rating: book.gore_rating }

    uri = textOf(book.cover_url)
    if uri <> "" then uri = m.top.base + uri
    if m.uri = invalid or uri <> m.uri
        m.uri = uri
        m.poster.uri = uri
        showCloth(uri = "")
        m.face = invalid
        if uri = "" then m.face = boxFace()
        m.blood.opacity = 0
        m.chilli.opacity = 0
        if m.top.current and m.face <> invalid then fadeEffects()
    end if
    showEffects()
    m.clothTitle.text = title
    layoutCloth()
    layout()
end sub

sub onCoverStatus()
    status = m.poster.loadStatus
    if status = "failed"
        showCloth(true)
        m.face = boxFace()
    else if status = "ready"
        showCloth(false)
        m.face = imageFace(m.poster.bitmapWidth, m.poster.bitmapHeight)
    else
        return
    end if
    showEffects()
    if m.top.current then fadeEffects()
end sub

sub showCloth(shown as Boolean)
    m.cloth.visible = shown
    m.frame.visible = shown
end sub

function boxFace() as Object
    return { x: 0, y: 0, width: 605, height: m.boxHeight }
end function

' The image is scaled to fit the box and centred in it.
function imageFace(width as Float, height as Float) as Object
    if width <= 0 or height <= 0 then return boxFace()
    scale = 605 / width
    if m.boxHeight / height < scale then scale = m.boxHeight / height
    return { x: (605 - width * scale) / 2, y: (m.boxHeight - height * scale) / 2, width: width * scale, height: height * scale }
end function

' roku:build renders blood-<gore>.png at the box's size, stretched here to the face, and chilli-<spice>.png from
' the face's bottom right corner (96 by 136 at full width), scaled with the face's width.
sub showEffects()
    book = m.top.book
    if m.face = invalid or book = invalid
        m.blood.visible = false
        m.chilli.visible = false
        return
    end if
    face = m.face
    gore = ratingOf(book.gore_rating)
    spice = ratingOf(book.spice_rating)
    m.blood.visible = gore > 0
    if gore > 0
        m.blood.uri = "pkg:/images/blood-" + gore.ToStr() + ".png"
        m.blood.translation = [face.x, face.y]
        m.blood.width = face.width
        m.blood.height = face.height
    end if
    m.chilli.visible = spice > 0
    if spice > 0
        scale = face.width / 605
        m.chilli.uri = "pkg:/images/chilli-" + spice.ToStr() + ".png"
        m.chilli.width = 96 * scale
        m.chilli.height = 136 * scale
        m.chilli.translation = [face.x + face.width - 96 * scale, face.y + face.height - 136 * scale]
    end if
end sub

sub fadeEffects()
    m.effectsFade.control = "stop"
    m.blood.opacity = 0
    m.chilli.opacity = 0
    m.effectsFade.control = "start"
end sub

sub layoutCloth()
    titleHeight = m.clothTitle.BoundingRect().height
    total = titleHeight + 38 + 58
    top = (m.boxHeight - total) / 2
    m.clothTitle.translation = [58, top]
    m.clothUmbel.translation = [273, top + titleHeight + 38]
end sub

' Stacks the text and centres it on the cover box; the synopsis gets the lines that remain above the caption's
' clearance at the bottom of the column.
sub layout()
    y = 0
    y = place(m.title, y, 0)
    y = place(m.author, y, 19)
    y = place(m.meta, y, 23)
    y = y + 30
    m.ratings.translation = [0, y]
    y = y + m.ratings.rowsHeight
    m.synopsis.visible = false
    if m.synopsis.text <> ""
        room = m.boxHeight - 48 - (y + 38)
        lines = 0
        if room >= m.firstLine then lines = 1 + Int((room - m.firstLine) / m.lineStep)
        if lines > 0
            m.synopsis.maxLines = lines
            m.synopsis.visible = true
            y = place(m.synopsis, y, 38)
        end if
    end if
    m.text.translation = [816, 86 + Int((m.boxHeight - y) / 2)]
end sub

function place(label as Object, y as Float, gap as Integer) as Float
    if label.text = ""
        label.visible = false
        return y
    end if
    label.visible = true
    label.translation = [0, y + gap]
    return y + gap + label.BoundingRect().height
end function

sub onCurrent()
    target = 0.0
    if m.top.current then target = 1.0
    m.fade.control = "stop"
    m.fadeTo.keyValue = [m.body.opacity, target]
    m.fade.control = "start"
    if m.top.current and m.face <> invalid then fadeEffects()
    if not m.top.current then m.ratings.highlight = ""
end sub

sub onHighlight()
    m.ratings.highlight = m.top.highlight
end sub
