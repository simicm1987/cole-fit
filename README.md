# Cole Fit web version

## Files

- `index.html` – page shell and p5.js loader
- `style.css` – basic full-page layout
- `sketch.js` – converted Processing 4 application

## Using the app

- Click **OPEN .TXT** or press **O**.
- Select a local `.txt` file.
- Expected columns: `f,R,X`.
- `f` is in Hz; `R` and `X` are in ohms.
- `X = Im(Z)` must be `<= 0`.
- Delimiters may be commas, semicolons, or whitespace.
- The header row is optional.
- Blank lines and lines beginning with `#`, `%`, or `//` are ignored.
- Press **R** to re-read the last selected file during the current browser session.

The selected local file is read by the browser. This code does not upload it to a server.
