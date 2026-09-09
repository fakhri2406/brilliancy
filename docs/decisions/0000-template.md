# NNNN — Short title

Copy this file to `docs/decisions/NNNN-short-title.md`, taking the next unused
number. Numbers run sequentially and are **never renumbered and never deleted** —
a superseded record stays where it is and gains a pointer to its replacement
(§16).

Write a record when a choice would otherwise only be visible by reading the code
and would surprise someone six months later. Do not write one for routine
implementation choices: if the code is self-evident the record is noise, and a
directory of noise is a directory nobody reads (§16).

The four headings below are fixed. Keep them, in this order, and delete this
preamble.

## Context

What forced the choice. The constraint, the conflict, or the thing that broke.
Cite the spec sections involved.

## Decision

What was chosen, stated so it can be checked against the code. One decision per
record.

## Consequences

What this now costs, forbids, or obliges — including the parts that are
inconvenient. Say what would have to happen to reverse it.

## Status

`accepted`, or `superseded by NNNN`.
