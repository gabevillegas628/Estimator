# Third-Party Notices

The Financial Aid Estimator incorporates open source software from the
projects listed below. Each remains under its own license; the notices here
are reproduced to satisfy the attribution conditions those licenses attach.

Nothing in [LICENSE](LICENSE) limits your rights in these components under
their own terms.

A scan of the full dependency tree (211 packages) found **no GPL, AGPL, or
LGPL code** anywhere in the project, including transitive dependencies.

---

## 1. Components delivered to the browser

These are the only third-party components bundled into the JavaScript served
to end users. Vite strips license banners during minification, so their
notices are reproduced here instead.

| Component | Copyright | License |
|---|---|---|
| react | Copyright (c) Meta Platforms, Inc. and affiliates. | MIT |
| react-dom | Copyright (c) Meta Platforms, Inc. and affiliates. | MIT |
| scheduler | Copyright (c) Meta Platforms, Inc. and affiliates. | MIT |
| lucide-react | Copyright (c) 2026 Lucide Icons and Contributors | ISC |

**Lucide icons — additional attribution.** Several icons used in this
application (`Check`, `Info`, `Lock`, `LogOut`, `Plus`, `Trash2`, `X`,
`TriangleAlert`) are derived from the Feather icon project:

> Copyright (c) 2013-present Cole Bemis — The MIT License (MIT)

---

## 2. Components running on the server

These execute on the application server and are not delivered to browsers.

| Component | Copyright | License |
|---|---|---|
| express | Copyright (c) 2009-2014 TJ Holowaychuk; 2013-2014 Roman Shtylman; 2014-2015 Douglas Christopher Wilson | MIT |
| pg | Copyright (c) 2010-2021 Brian Carlson | MIT |
| cookie-parser | Copyright (c) 2014 TJ Holowaychuk; 2015 Douglas Christopher Wilson | MIT |
| qs | Copyright (c) 2014 Nathan LaFreniere and other contributors | BSD-3-Clause |

Their transitive dependencies are MIT, ISC, or BSD-3-Clause and are covered
by the license texts in section 4.

---

## 3. Build-time components (not distributed)

These run only when building or testing the project. Their output is not a
derivative work of them, and none is redistributed by this application. They
are recorded here for completeness.

| Component | License | Note |
|---|---|---|
| vite, tailwindcss, vitest, and their dependencies | MIT / ISC | |
| lightningcss | MPL-2.0 | Used unmodified as a CSS minifier. MPL-2.0 obligations attach to distributing the covered source files, which this project does not do. Source: https://github.com/parcel-bundler/lightningcss |
| caniuse-lite | CC-BY-4.0 | Browser-support database consumed at build time; the database itself is not redistributed. |
| rxjs, expect-type, detect-libc, baseline-browser-mapping | Apache-2.0 | No NOTICE files present in these distributions. |
| source-map-js | BSD-3-Clause | |
| tslib | 0BSD | No attribution required. |

---

## 4. License texts

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### BSD 3-Clause License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

## Regenerating this list

Dependencies change. To re-check licenses after `npm install`:

```
npx license-checker-rseidelsohn --summary
```

Verify in particular that no GPL/AGPL/LGPL component has entered the tree and
that nothing new is delivered to the browser without attribution above.
