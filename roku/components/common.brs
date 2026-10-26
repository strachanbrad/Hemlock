' Copyright (c) 2023 Hemlock
' SPDX-License-Identifier: GPL-3.0-only

' Wall-clock milliseconds; the slideshow re-anchors when the clock moves backwards.
function nowMs() as Double
    clock = CreateObject("roDateTime")
    return clock.AsSeconds() * 1000# + clock.GetMilliseconds()
end function

' An http or https origin with an optional path and no trailing slash, or "" when the value is not one.
function cleanBase(value as Dynamic) as String
    if type(value) <> "String" and type(value) <> "roString" then return ""
    base = value.Trim()
    while Right(base, 1) = "/"
        base = Left(base, Len(base) - 1)
    end while
    pattern = CreateObject("roRegex", "^https?://[^/\s?#]+(/[^\s?#]*)?$", "i")
    if not pattern.IsMatch(base) then return ""
    return base
end function

function textOf(value as Dynamic) as String
    if type(value) = "String" or type(value) = "roString" then return value
    return ""
end function

' A number read from a parsed list arrives boxed (roInteger) and one from a parsed record intrinsic (Integer); every numeric type counts.
function ratingOf(value as Dynamic) as Integer
    numbers = { Integer: 1, roInt: 1, roInteger: 1, LongInteger: 1, roLongInteger: 1, Float: 1, roFloat: 1, Double: 1, roDouble: 1 }
    if not numbers.DoesExist(type(value)) then return 0
    rating = Int(value)
    if rating < 0 then return 0
    if rating > 5 then return 5
    return rating
end function

' ParseJson prints an error on the debug console for a body that is not JSON (an nginx error page).
function parseBody(body as String) as Dynamic
    first = Left(body.Trim(), 1)
    if first <> "{" and first <> "[" then return invalid
    return ParseJson(body)
end function

' A text field of a parsed JSON object, or "" when the body is not an object or the field is not text.
function textIn(body as Dynamic, name as String) as String
    if type(body) <> "roAssociativeArray" then return ""
    return textOf(body[name])
end function
