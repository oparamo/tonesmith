---
"@tonesmith/core": major
---

Saving a patch file no longer truncates the one already there.

Every write went straight at the target path, which empties the file before the first byte lands, so
anything failing partway (a full disk, an interrupted process, a throw between opening and closing)
left a patch library at zero bytes with no copy of what it held. The write now fills a sibling file
and renames it over the target, which is atomic within a directory: the path holds either the old
file or the new one. A failed write cleans up its sibling and leaves the target untouched.

Drivers get this from `writeFileAtomic`, shared in core rather than written per device, since the
file every driver overwrites is the user's own library.
