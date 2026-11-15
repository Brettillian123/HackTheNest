# site-check

site-check checks a folder of HTML files for broken links.

## Install

```bash
pip install site-check
```

## Use

Check every HTML file in a folder:

```bash
site-check ./public
```

Add `--external` to also check links that point outside the site:

```bash
site-check ./public --external
```

## Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `SITE_CHECK_TIMEOUT` | Request timeout in seconds | `10` |

## Test

Run the test suite from the repository root:

```bash
pytest
```

## Limits

- Images are not checked yet; only links are.
