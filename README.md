# Wave Cutter for TOEIC&reg;

A tool for editing wave data of TOEIC listening CD.
This tool divide one wave into multiple waves which contains one question for each.
You'll never need to spend time looking for start point from one big wave.

**[Try it!](http://jinjor.github.io/wave-cutter-for-toeic)**

<img width="600px" src="./wc4t-screen.png">


## Usage

1. Load your MP3 file. Its wave will be automatically divided into multiple waves.
2. Sometimes you'll need to edit cutting points manually.
3. Generate ZIP file that contains all waves in form of MP3.

About 2, you can think it's a kind of game of matching file names and waves.

### Naming rules

You can choose naming rules from below.

|Rule|Goal|Names|
|:--|:--|:--|
|All|54|1, 2, 3, ..., 32-34, 35-37, ... 98-100|
|All+|123|1, 2, 3, ..., 32-34, 32, 33, 34, 35-37, 35, 36, 37, ... 98-100, 98, 99, 100|
|Part1|6|1, 2, 3, 4, 5, 6|
|Part2|25|7, 8, 9, ..., 31|
|Part3|13|32-34, 35-37, ..., 68-70|
|Part3+|52|32-34, 32, 33, 34, 35-37, 35, 36, 37, ..., 68-70, 68, 69, 70|
|Part4|10|71-73, 74-76, ..., 98-100|
|Part4+|40|71-73, 71, 72, 73, 74-76, 74, 75, 76, ..., 98-100, 98, 99, 100|
|From X|-|X, X+1, X+2, ...|

## Support

### Browsers

|Browser|Supported|
|:--|:--|
|Chrome|✓|
|Firefox|✓|
|Edge|✓|
|Safari|Not tested|
|Opera|Not tested|
|IE9-11|✗|
|Mobile browsers|Not supported|

### Decoding format

|Format|Supported|
|:--|:--|
|.mp3|✓|
|.ogg|Not tested|
|.aac|Not tested|
|.wav|Not tested|
|other formats|Not supported|

### Encoding format

|Format|Supported|
|:--|:--|
|.mp3|✓|
|other formats|Not supported|

## Development

### Install

```
npm install
```

### Build

```
npm run watch
```
