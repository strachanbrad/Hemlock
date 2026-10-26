' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' Every request of the channel runs on this one thread: the long poll on GET /api/changes while `polling` is on,
' and each { id, method, url, body, auth } set on `request`, answered on `response` as { id, code, body, reason }.
' `changed` counts up whenever the library may have changed, `unauthorized` when the long poll answers 401.
' Requests carry the device token unless `auth` is false; the token is never logged.

sub init()
    m.top.functionName = "serve"
end sub

sub serve()
    m.port = CreateObject("roMessagePort")
    m.top.ObserveField("request", m.port)
    m.top.ObserveField("base", m.port)
    m.top.ObserveField("token", m.port)
    m.top.ObserveField("polling", m.port)
    m.versionPattern = CreateObject("roRegex", Chr(34) + "version" + Chr(34) + "\s*:\s*(-?\d+)", "")
    m.transfers = {}
    m.changes = 0
    m.refusals = 0
    m.poll = invalid
    restartPoll()
    m.top.ready = true
    while true
        msg = Wait(500, m.port)
        kind = type(msg)
        if kind = "roSGNodeEvent"
            if msg.GetField() = "request"
                startRequest(msg.GetData())
            else
                restartPoll()
            end if
        else if kind = "roUrlEvent"
            onTransfer(msg)
        end if
        checkTimers()
    end while
end sub

sub restartPoll()
    if m.poll <> invalid then m.poll.xfer.AsyncCancel()
    m.poll = invalid
    m.base = m.top.base
    m.token = m.top.token
    m.polling = m.top.polling
    m.version = ""
    m.fallback = false
    m.pollAt = 0#
end sub

sub checkTimers()
    t = nowMs()
    if m.poll = invalid
        if m.polling and m.base <> "" and t >= m.pollAt then startPoll(t)
    else if t - m.poll.startedAt > 40000
        ' The server answers within 30 seconds; a longer hold is a dead connection.
        m.poll.xfer.AsyncCancel()
        m.poll = invalid
        m.pollAt = t + 5000
    end if

    late = []
    for each key in m.transfers
        if t - m.transfers[key].startedAt > 20000 then late.Push(key)
    end for
    for each key in late
        entry = m.transfers[key]
        m.transfers.Delete(key)
        entry.xfer.AsyncCancel()
        respond(entry.id, -28, "", "Timed out")
    end for
end sub

sub startPoll(t as Double)
    if m.fallback
        ' A server without GET /api/changes: refetch once a minute.
        signalChange()
        m.fallback = false
    end if
    url = m.base + "/api/changes?wait=25"
    if m.version <> "" then url = m.base + "/api/changes?since=" + m.version + "&wait=25"
    xfer = newTransfer(url, true)
    if xfer.AsyncGetToString()
        m.poll = { xfer: xfer, identity: xfer.GetIdentity(), startedAt: t }
    else
        m.pollAt = t + 5000
    end if
end sub

sub onPoll(code as Integer, body as String, startedAt as Double)
    t = nowMs()
    if code = 200
        match = m.versionPattern.Match(body)
        if match.Count() < 2
            m.pollAt = t + 5000
            return
        end if
        if match[1] <> m.version
            m.version = match[1]
            signalChange()
            m.pollAt = t
        else if t - startedAt < 1000
            ' A server that answers at once with the same version must not be asked again at once.
            m.pollAt = t + 1000
        else
            m.pollAt = t
        end if
    else if code = 404
        m.fallback = true
        m.pollAt = t + 60000
    else if code = 401
        ' The TV is not paired, or was removed on the admin page; the scene pairs it again.
        m.polling = false
        m.refusals = m.refusals + 1
        m.top.unauthorized = m.refusals
    else
        m.pollAt = t + 5000
    end if
end sub

sub signalChange()
    m.changes = m.changes + 1
    m.top.changed = m.changes
end sub

sub startRequest(request as Object)
    auth = true
    if type(request.auth) = "Boolean" or type(request.auth) = "roBoolean"
        if not request.auth then auth = false
    end if
    xfer = newTransfer(request.url, auth)
    started = false
    if request.method = "GET"
        started = xfer.AsyncGetToString()
    else
        xfer.SetRequest(request.method)
        xfer.AddHeader("Content-Type", "application/json")
        started = xfer.AsyncPostFromString(request.body)
    end if
    if started
        m.transfers[xfer.GetIdentity().ToStr()] = { id: request.id, xfer: xfer, startedAt: nowMs() }
    else
        respond(request.id, -1, "", "The request could not be started")
    end if
end sub

sub onTransfer(msg as Object)
    if msg.GetInt() <> 1 then return
    source = msg.GetSourceIdentity()
    if m.poll <> invalid and m.poll.identity = source
        startedAt = m.poll.startedAt
        m.poll = invalid
        onPoll(msg.GetResponseCode(), msg.GetString(), startedAt)
        return
    end if
    key = source.ToStr()
    entry = m.transfers[key]
    if entry = invalid then return
    m.transfers.Delete(key)
    respond(entry.id, msg.GetResponseCode(), msg.GetString(), msg.GetFailureReason())
end sub

sub respond(id as String, code as Integer, body as String, reason as String)
    m.top.response = { id: id, code: code, body: body, reason: reason }
end sub

' The transfer must stay referenced until its event arrives, or it is cancelled.
function newTransfer(url as String, auth as Boolean) as Object
    xfer = CreateObject("roUrlTransfer")
    xfer.SetMessagePort(m.port)
    xfer.SetUrl(url)
    xfer.RetainBodyOnError(true)
    xfer.EnableEncodings(true)
    xfer.AddHeader("Accept", "application/json")
    if auth and m.token <> "" then xfer.AddHeader("Authorization", "Bearer " + m.token)
    if LCase(Left(url, 6)) = "https:"
        xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
        xfer.InitClientCertificates()
    end if
    return xfer
end function
