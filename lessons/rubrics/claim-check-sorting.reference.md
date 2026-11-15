# Claim check: sorted() and list.sort()

Each claim in the model's answer, checked against the Python docs.

## Answer checked

The question was: what is the difference between sorted() and list.sort() in Python? The answer made five claims, listed below.

## Claims

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | list.sort() returns the sorted list | Wrong | The docs say it modifies the list in place and returns None |
| 2 | sorted() works on any iterable, such as a tuple | Supported | The docs say sorted() accepts any iterable |
| 3 | list.sort() changes the list in place | Supported | The docs say it modifies the list in place |
| 4 | Both sorts are stable | Supported | The docs say sorts are guaranteed to be stable |
| 5 | sorted() uses less memory than list.sort() | Unconfirmed | The page says nothing about memory use |

## Sources

- Python docs, Sorting Techniques: https://docs.python.org/3/howto/sorting.html

## Summary

- Three claims are supported, one is wrong and one is unconfirmed.
- Fix claim 1 before anyone relies on it: code that uses the result of list.sort() gets None.
- Claim 5 needs a source or a measurement before it is repeated.
