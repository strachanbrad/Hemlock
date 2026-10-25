' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' The slide at time t is (anchorIndex + floor((t - anchorAt) / interval)) mod n; a paused show reads pausedAt.
' Times are milliseconds as Double.
function createShow(interval as Double, t as Double) as Object
    return { books: [], interval: interval, anchorAt: t, anchorIndex: 0, pausedAt: invalid }
end function

function slotOf(show as Object, t as Double) as Integer
    at = t
    if show.pausedAt <> invalid then at = show.pausedAt
    return Int((at - show.anchorAt) / show.interval)
end function

sub reanchor(show as Object, t as Double, index as Integer)
    show.anchorAt = t
    show.anchorIndex = index
    if show.pausedAt <> invalid then show.pausedAt = t
end sub

function currentIndex(show as Object, t as Double) as Integer
    n = show.books.Count()
    if n = 0 then return -1
    slot = slotOf(show, t)
    if slot < 0
        ' The clock moved backwards.
        reanchor(show, t, show.anchorIndex)
        slot = 0
    end if
    return (show.anchorIndex + slot) mod n
end function

' Keeps the book on screen, matched by id, and its remaining time; a deleted book yields its position.
sub applyBooks(show as Object, books as Object, t as Double)
    i = currentIndex(show, t)
    slot = slotOf(show, t)
    if slot < 0 then slot = 0
    slotStart = show.anchorAt + slot * show.interval
    keep = 0
    if i >= 0 and books.Count() > 0
        keep = indexOfBook(books, show.books[i].id)
        if keep < 0 then keep = i mod books.Count()
    end if
    show.books = books
    if i >= 0
        show.anchorAt = slotStart
    else
        show.anchorAt = t
        if show.pausedAt <> invalid then show.pausedAt = t
    end if
    show.anchorIndex = keep
end sub

sub moveShow(show as Object, t as Double, delta as Integer)
    n = show.books.Count()
    if n > 0 then reanchor(show, t, (((currentIndex(show, t) + delta) mod n) + n) mod n)
end sub

sub togglePause(show as Object, t as Double)
    if show.pausedAt = invalid
        show.pausedAt = t
    else
        show.anchorAt = show.anchorAt + (t - show.pausedAt)
        show.pausedAt = invalid
    end if
end sub

' Ids are compared as strings, so a numeric and a string id never raise a type mismatch.
function bookKey(id as Dynamic) as String
    if id = invalid then return ""
    return id.ToStr()
end function

function indexOfBook(books as Object, id as Dynamic) as Integer
    key = bookKey(id)
    for i = 0 to books.Count() - 1
        if bookKey(books[i].id) = key then return i
    end for
    return -1
end function
