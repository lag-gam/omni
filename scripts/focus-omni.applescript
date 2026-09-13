-- Focus the Omni tab in the default browser.
-- Assign this to a system hotkey (e.g. fn+Opt) via Shortcuts.app
-- or Raycast for hands-free activation.

on focusInChrome()
	tell application "Google Chrome"
		activate
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t contains "localhost:3000" then
					set active tab index of w to index of t
					set index of w to 1
					return true
				end if
			end repeat
		end repeat
	end tell
	return false
end focusInChrome

on focusInArc()
	tell application "Arc"
		activate
		tell front window
			repeat with t in tabs
				if URL of t contains "localhost:3000" then
					tell t to select
					return true
				end if
			end repeat
		end tell
	end tell
	return false
end focusInArc

on focusInSafari()
	tell application "Safari"
		activate
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t contains "localhost:3000" then
					set current tab of w to t
					set index of w to 1
					return true
				end if
			end repeat
		end repeat
	end tell
	return false
end focusInSafari

-- Try each browser in order; stop at the first one that has Omni open.
try
	if my focusInArc() then return
end try
try
	if my focusInChrome() then return
end try
try
	if my focusInSafari() then return
end try

display notification "Omni tab not found — is npm run dev running?" with title "Omni"
