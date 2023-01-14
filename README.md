# ts-pretty
[![CI Actions](https://github.com/pcafstockf/ts-pretty/workflows/CI/badge.svg)](https://github.com/pcafstockf/ts-pretty/actions)
[![Publish Actions](https://github.com/pcafstockf/ts-pretty/workflows/NPM%20Publish/badge.svg)](https://github.com/pcafstockf/ts-pretty/actions)
[![npm version](https://badge.fury.io/js/ts-pretty.svg)](https://badge.fury.io/js/ts-pretty)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Configurable prettier plugin which harnesses the TypeScript Compiler API.

## Opinionated
Opinions vary, but if you share these opinions, this might be the plugin for you.
* Uniformity matters, but readability trumps uniformity every time.
* Formatting should **enhance** the readability of a language, not reduce it to a one size fits all formula.
* Formatting should allow code to be quickly absorbed / scanned, rather than [forcing a careful reading of each line](https://github.com/pcafstockf/ts-pretty/blob/master/fixtures/one-size-fits-all.md).

## Overview

ts-pretty effectively replaces the generic TypeScript / JavaScript formatters built in to prettier, with the same TypeScript aware library used by
[vscode](https://code.visualstudio.com/Docs/languages/typescript) (i.e. the [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)).

The TypeScript Compiler API contains a `ts.Printer` service, which is a highly opinionated pretty printer with no real configurability. 
However, it is written by the TypeScript team, obviously has an innate understanding of the language, and produces easily absorb-able / scan-able code.  
`ts.LanguageService` is also built into TypeScript, and provides a [highly configurable](https://thejohnfreeman.github.io/TypeScript/interfaces/formatcodeoptions.html) whitespace formatter.  
Please see `FormatCodeSettings` in [the ts definition file](https://github.com/microsoft/TypeScript/blob/main/lib/typescript.d.ts) 
for a complete list of supported white space formatting options.

ts-pretty feeds your code into `ts.Printer`, and then passes that output into `ts.LanguageService` to create the final output for prettier. 
This is about as close as we are going to get to vscode, outside of vscode :-).

By default, ts-pretty picks up existing prettier options such as `useTabs`, `tabWidth`, `singleQuote`, etc.
These options (along with all `ts.FormatCodeSettings` options) can be overridden using a json5 configuration file (ts-format.json) whose schema is `ts.FormatCodeSettings`.  

## Installation
ts-pretty requires prettier and typescript (even for JavaScript projects).  These are peerDependencies and will be installed if not present.  
Node.js 14.17.0+ is also required.

Simply install `prettier-plugin-ts-pretty`, and prettier will automatically use it whenever prettier is run.

```bash
npm install prettier-plugin-ts-pretty --save-dev
```
or
```bash
npm i prettier-plugin-ts-pretty -D
```
#### Caveat
This plugin overrides any previously loaded Prettier parsers for babel, babel-ts, espree, meriyah, acorn, and typescript (including the built-ins).  
However, ts-pretty allows you to optionally use the output of the **previously** loaded parser **as input** to ts-pretty.  
Additionally, ts-pretty allows you to optionally skip its own transformations.  
The combination of these two options allow you to effectively disable ts-pretty, although why would you want to :astonished: ?

## Options
| Name        | Type  |    Default | Description                                   |
|------------------|-------|--------:|:----------------------------------------------|
|tspTsConfig       |string |process.env.TS_NODE_PROJECT `??`<br/>'./tsconfig.json' `??`<br />[hardcoded subset](https://github.com/pcafstockf/ts-pretty/blob/master/src/index.ts#L257) of tsconfig options | Path to a tsconfig.json file.                 |
|tspTsFormat       |string |[hardcoded subset](https://github.com/pcafstockf/ts-pretty/blob/master/src/index.ts#L17) of `ts.FormatCodeSettings` | Path to a ts-format.json file.                |
|tspOrganizeImports|boolean|false| [Removes unused, sorts by paths and names](https://devblogs.microsoft.com/typescript/announcing-typescript-2-8-2/#organize-imports).     |
|tspDisable        |boolean|false| Do not perform any ts-pretty transformations. |
|tspUseBuiltins    |boolean|false| Use a (appropriate) previously loaded parser. |

## Usage
```bash
prettier --use-tabs --tsp-organize-imports --write .
```



## Acknowledgments
Thanks to the TypeScript team, not only for the language, but also for implementing and exposing these capabilities.  
Thanks to [David Sherret](https://github.com/dsherret) for his countless contributions (all over the Internet) explaining how the TypeScript Compiler API actually works. 
And for [ts-morph](https://github.com/dsherret/ts-morph) which is an amazing TypeScript utility.  
Thanks to [Simon Hänisch](https://github.com/simonhaenisch) whose [prettier-plugin-organize-imports](https://github.com/simonhaenisch/prettier-plugin-organize-imports) project helped me understand how to override and integrate prettier builtins.

## [MIT License](https://choosealicense.com/licenses/mit/)

Copyright (c) 2023 Frank Stock

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
