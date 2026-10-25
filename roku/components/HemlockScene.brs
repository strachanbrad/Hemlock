' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

sub init()
    m.registry = CreateObject("roRegistrySection", "hemlock")
    m.defaultBase = cleanBase(CreateObject("roAppInfo").GetValue("hemlock_base_url"))
    m.settings = loadSettings()
    m.order = ["read", "star_rating", "spice_rating", "gore_rating"]

    m.slides = [m.top.FindNode("slideA"), m.top.FindNode("slideB"), m.top.FindNode("slideC")]
    m.keys = ["", "", ""]
    m.shown = ["", "", ""]
    m.current = -1
    m.previous = -1
    m.slideGroup = m.top.FindNode("slides")
    m.message = m.top.FindNode("message")
    m.paused = m.top.FindNode("paused")
    m.notice = m.top.FindNode("notice")
    m.noticeBox = m.top.FindNode("noticeBox")
    m.noticeText = m.top.FindNode("noticeText")
    m.settingsDialog = m.top.FindNode("settings")
    m.settingsDialog.ObserveField("result", "onSettingsClosed")
    layoutCaption()

    m.http = m.top.FindNode("http")
    m.http.ObserveField("response", "onResponse")
    m.http.ObserveField("changed", "onChanged")
    m.http.ObserveField("ready", "onHttpReady")
    m.outbox = []
    m.tick = m.top.FindNode("tick")
    m.tick.ObserveField("fire", "onTick")
    m.retry = m.top.FindNode("retry")
    m.retry.ObserveField("fire", "loadBooks")
    m.noticeTimer = m.top.FindNode("noticeTimer")
    m.noticeTimer.ObserveField("fire", "hideNotice")

    m.requests = 0
    m.listRequest = ""
    m.listAgain = false
    m.saves = []
    m.saving = invalid
    m.pending = {}
    m.confirmed = {}
    m.highlight = ""
    m.deferred = invalid
    m.status = "loading"
    m.show = createShow(m.settings.seconds * 1000#, nowMs())

    setBase()
    m.http.control = "run"
    m.tick.control = "start"
    loadBooks()
    m.top.SetFocus(true)
    note("started with " + FormatJson(m.settings))
end sub

sub note(text as String)
    clock = CreateObject("roDateTime")
    clock.ToLocalTime()
    time = Mid(clock.ToISOString(), 12, 8) + "." + Right("00" + clock.GetMilliseconds().ToStr(), 3)
    print "[hemlock " + time + "] " + text
end sub

' ── settings ──────────────────────────────────────────────

function loadSettings() as Object
    base = cleanBase(m.registry.Read("base_url"))
    if base = "" then base = m.defaultBase
    filter = m.registry.Read("filter")
    if filter <> "all" and filter <> "read" and filter <> "unread" then filter = "owned"
    seconds = Int(Val(m.registry.Read("seconds")))
    if seconds < 5 or seconds > 3600 then seconds = 10
    return { base: base, filter: filter, seconds: seconds }
end function

' The base URL is kept only when it differs from the manifest's, so a rebuilt default reaches the TV.
sub saveSettings()
    if m.settings.base = m.defaultBase
        m.registry.Delete("base_url")
    else
        m.registry.Write("base_url", m.settings.base)
    end if
    m.registry.Write("filter", m.settings.filter)
    m.registry.Write("seconds", m.settings.seconds.ToStr())
    m.registry.Flush()
end sub

sub setBase()
    for each slide in m.slides
        slide.base = m.settings.base
    end for
    m.http.base = m.settings.base
end sub

sub openSettings()
    m.settingsDialog.values = { base: m.settings.base, filter: m.settings.filter, seconds: m.settings.seconds }
    m.settingsDialog.visible = true
    m.settingsDialog.SetFocus(true)
    note("settings opened")
end sub

sub onSettingsClosed(event as Object)
    values = event.GetData()
    m.settingsDialog.visible = false
    ' The scene is already in the focus chain while the dialog holds focus, so focusing it alone moves nothing.
    m.settingsDialog.SetFocus(false)
    m.top.SetFocus(true)
    t = nowMs()
    previous = m.settings
    m.settings = { base: values.base, filter: values.filter, seconds: values.seconds }
    saveSettings()
    note("settings closed with " + FormatJson(m.settings))

    if m.settings.seconds <> previous.seconds
        index = currentIndex(m.show, t)
        m.show.interval = m.settings.seconds * 1000#
        if index >= 0 then reanchor(m.show, t, index)
    end if
    if m.settings.base <> previous.base
        setHighlight("")
        m.show = createShow(m.settings.seconds * 1000#, t)
        m.status = "loading"
        m.listRequest = ""
        m.listAgain = false
        m.deferred = invalid
        setBase()
        renderStatus()
        present(t)
        loadBooks()
    else if m.settings.filter <> previous.filter
        loadBooks()
    end if
end sub

' ── the list ──────────────────────────────────────────────

function send(method as String, url as String, body as String) as String
    m.requests = m.requests + 1
    id = "r" + m.requests.ToStr()
    request = { id: id, method: method, url: url, body: body }
    if m.http.ready
        m.http.request = request
    else
        m.outbox.Push(request)
    end if
    return id
end function

sub onHttpReady()
    for each request in m.outbox
        m.http.request = request
    end for
    m.outbox = []
end sub

sub loadBooks()
    if m.listRequest <> ""
        m.listAgain = true
        return
    end if
    m.retry.control = "stop"
    m.listRequest = send("GET", m.settings.base + "/api/display?filter=" + m.settings.filter, "")
end sub

sub onChanged()
    note("library changed")
    loadBooks()
end sub

sub onResponse(event as Object)
    response = event.GetData()
    if response.id = m.listRequest
        onBooks(response)
    else if m.saving <> invalid and response.id = m.saving.request
        onSaved(response)
    end if
end sub

sub onBooks(response as Object)
    m.listRequest = ""
    books = invalid
    if response.code = 200 then books = parseBody(response.body)
    if type(books) = "roArray"
        note("fetched " + books.Count().ToStr() + " books")
        m.status = "ready"
        ' A refetch waits while ratings are edited, so the book being edited never moves.
        if m.highlight <> ""
            m.deferred = books
        else
            applyList(books)
        end if
    else
        note("fetch failed: " + failureOf(response))
        if m.status <> "ready" then m.status = "unreachable"
        m.retry.control = "start"
    end if
    renderStatus()
    if m.listAgain
        m.listAgain = false
        loadBooks()
    end if
end sub

' A refetched record carries the server's values, so the values of unsettled saves are laid over it.
sub applyList(books as Object)
    for each book in books
        pending = m.pending[bookKey(book.id)]
        if pending <> invalid then book.Append(pending)
    end for
    t = nowMs()
    applyBooks(m.show, books, t)
    renderStatus()
    present(t)
end sub

sub renderStatus()
    text = ""
    if m.status = "unreachable"
        text = "Can't reach Hemlock at " + m.settings.base
    else if m.status = "ready" and m.show.books.Count() = 0
        text = "No books to show."
    end if
    m.message.text = text
    m.message.visible = text <> ""
    m.slideGroup.visible = text = ""
end sub

function failureOf(response as Object) as String
    if response.code <= 0 then return "can't reach Hemlock"
    body = parseBody(response.body)
    if type(body) = "roAssociativeArray" and textOf(body.error) <> "" then return body.error
    return "HTTP " + response.code.ToStr()
end function

' ── the slides ────────────────────────────────────────────

sub onTick()
    present(nowMs())
end sub

' Three slides: the current one, the one fading out, and the next one with its cover loading.
sub present(t as Double)
    index = currentIndex(m.show, t)
    m.paused.visible = index >= 0 and m.show.pausedAt <> invalid
    if index < 0
        if m.current >= 0 then m.slides[m.current].current = false
        m.current = -1
        return
    end if
    books = m.show.books
    book = books[index]
    key = bookKey(book.id)
    if m.current < 0 or m.keys[m.current] <> key
        slide = slideFor(key)
        if m.current >= 0
            m.slides[m.current].highlight = ""
            m.slides[m.current].current = false
        end if
        m.previous = m.current
        m.current = slide
        fill(slide, book)
        m.slides[slide].current = true
        note("slide " + (index + 1).ToStr() + "/" + books.Count().ToStr() + " book " + key + " " + textOf(book.title))
    else
        fill(m.current, book)
    end if
    if books.Count() > 1
        following = books[(index + 1) mod books.Count()]
        if bookKey(following.id) <> key then fill(slideFor(bookKey(following.id)), following)
    end if
end sub

function slideFor(key as String) as Integer
    for i = 0 to 2
        if i <> m.current and m.keys[i] = key then return i
    end for
    for i = 0 to 2
        if i <> m.current and i <> m.previous then return i
    end for
    for i = 0 to 2
        if i <> m.current then return i
    end for
    return 0
end function

sub fill(i as Integer, book as Object)
    json = FormatJson(book)
    if m.shown[i] = json then return
    m.shown[i] = json
    m.keys[i] = bookKey(book.id)
    m.slides[i].book = book
end sub

function currentBook() as Dynamic
    index = currentIndex(m.show, nowMs())
    if index < 0 then return invalid
    return m.show.books[index]
end function

sub layoutCaption()
    text = m.top.FindNode("captionText")
    umbel = m.top.FindNode("captionUmbel")
    bounds = text.BoundingRect()
    x = 1805 - bounds.width
    y = 1022 - bounds.height
    text.translation = [x, y]
    umbel.translation = [x - 41, y + (bounds.height - 29) / 2]
end sub

' ── keys ──────────────────────────────────────────────────

function onKeyEvent(key as String, press as Boolean) as Boolean
    if m.settingsDialog.visible then return true
    if not press then return false
    t = nowMs()
    if key = "play"
        togglePlay(t)
    else if key = "OK"
        if m.highlight = "read"
            changeValue(1)
        else
            togglePlay(t)
        end if
    else if key = "right" or key = "left"
        delta = 1
        if key = "left" then delta = -1
        if m.highlight <> ""
            changeValue(delta)
        else
            stepShow(t, delta)
        end if
    else if key = "fastforward"
        stepShow(t, 1)
    else if key = "rewind"
        stepShow(t, -1)
    else if key = "up" or key = "down"
        if m.show.pausedAt = invalid or currentBook() = invalid then return false
        moveHighlight(key = "down")
    else if key = "back"
        if m.highlight = "" then return false
        setHighlight("")
        note("editing left")
    else if key = "options"
        openSettings()
        return true
    else
        return false
    end if
    present(t)
    return true
end function

sub togglePlay(t as Double)
    togglePause(m.show, t)
    if m.show.pausedAt = invalid
        setHighlight("")
        note("resumed")
    else
        note("paused")
    end if
end sub

sub stepShow(t as Double, delta as Integer)
    setHighlight("")
    moveShow(m.show, t, delta)
    note("step " + delta.ToStr())
end sub

sub moveHighlight(down as Boolean)
    if m.highlight = ""
        setHighlight("star_rating")
    else
        i = 0
        for j = 0 to m.order.Count() - 1
            if m.order[j] = m.highlight then i = j
        end for
        if down and i < m.order.Count() - 1 then i = i + 1
        if not down and i > 0 then i = i - 1
        setHighlight(m.order[i])
    end if
    note("highlight " + m.highlight)
end sub

sub setHighlight(field as String)
    m.highlight = field
    if m.current >= 0 then m.slides[m.current].highlight = field
    if field = "" and m.deferred <> invalid
        books = m.deferred
        m.deferred = invalid
        applyList(books)
    end if
end sub

' ── rating saves ──────────────────────────────────────────

function ratingsOf(book as Object) as Object
    return {
        read: book.read = true,
        star_rating: ratingOf(book.star_rating),
        spice_rating: ratingOf(book.spice_rating),
        gore_rating: ratingOf(book.gore_rating),
    }
end function

' Each change is one PATCH; the saves go one at a time, in order, so the last change is the one kept.
sub changeValue(delta as Integer)
    book = currentBook()
    if book = invalid then return
    field = m.highlight
    if field = "read"
        value = not (book.read = true)
    else
        value = ratingOf(book[field]) + delta
        if value < 0 or value > 5 then return
    end if
    key = bookKey(book.id)
    if m.confirmed[key] = invalid then m.confirmed[key] = ratingsOf(book)
    if m.pending[key] = invalid then m.pending[key] = {}
    m.pending[key][field] = value
    book[field] = value
    body = {}
    body[field] = value
    m.saves.Push({ key: key, body: FormatJson(body) })
    note("save book " + key + " " + FormatJson(body))
    if m.saving = invalid then sendSave()
end sub

sub sendSave()
    m.saving = invalid
    if m.saves.Count() = 0 then return
    save = m.saves.Shift()
    save.request = send("PATCH", m.settings.base + "/api/books/" + save.key, save.body)
    m.saving = save
end sub

sub onSaved(response as Object)
    save = m.saving
    record = invalid
    if response.code >= 200 and response.code < 300 then record = parseBody(response.body)
    if type(record) = "roAssociativeArray"
        note("saved book " + save.key + " " + FormatJson(ratingsOf(record)))
        m.confirmed[save.key] = ratingsOf(record)
        waiting = false
        for each other in m.saves
            if other.key = save.key then waiting = true
        end for
        if not waiting then settle(save.key)
    else
        reason = failureOf(response)
        note("save failed for book " + save.key + ": " + reason)
        ' The saves queued behind a failed one were built on its value.
        kept = []
        for each other in m.saves
            if other.key <> save.key then kept.Push(other)
        end for
        m.saves = kept
        settle(save.key)
        showNotice("Not saved: " + reason)
    end if
    sendSave()
    present(nowMs())
end sub

' Shows the server's last answer for the book once none of its saves is left.
sub settle(key as String)
    values = m.confirmed[key]
    m.confirmed.Delete(key)
    m.pending.Delete(key)
    if values = invalid then return
    for each list in [m.show.books, m.deferred]
        if list <> invalid
            i = indexOfBook(list, key)
            if i >= 0 then list[i].Append(values)
        end if
    end for
end sub

sub showNotice(text as String)
    m.noticeText.text = text
    width = m.noticeText.BoundingRect().width + 44
    m.noticeBox.width = width
    m.notice.translation = [1805 - width, 54]
    m.notice.visible = true
    m.noticeTimer.control = "stop"
    m.noticeTimer.control = "start"
end sub

sub hideNotice()
    m.notice.visible = false
end sub
