/* jslint node: true */
'use strict';

//
//	ANSI Terminal Support
//	
//	Resources:
//	* http://ansi-bbs.org/
//	* http://www.bbsdocumentary.com/library/PROGRAMS/GRAPHICS/ANSI/ansisys.txt
//	* http://en.wikipedia.org/wiki/ANSI_escape_code
//	* https://github.com/chjj/term.js/blob/master/src/term.js
//	* http://www.inwap.com/pdp10/ansicode.txt
//

const assert	= require('assert');
const miscUtil	= require('./misc_util.js');

exports.getFGColorValue				= getFGColorValue;
exports.getBGColorValue				= getBGColorValue;
exports.sgr							= sgr;
exports.getSGRFromGraphicRendition	= getSGRFromGraphicRendition;
exports.clearScreen					= clearScreen;
exports.resetScreen					= resetScreen;
exports.normal						= normal;
exports.goHome						= goHome;
//exports.deleteLine					= deleteLine;
exports.disableVT100LineWrapping	= disableVT100LineWrapping;
exports.setSyncTERMFont				= setSyncTERMFont;
exports.getSyncTERMFontFromAlias	= getSyncTERMFontFromAlias;
exports.setCursorStyle				= setCursorStyle;
exports.setEmulatedBaudRate			= setEmulatedBaudRate;


//
//	See also
//	https://github.com/TooTallNate/ansi.js/blob/master/lib/ansi.js

var ESC_CSI 	= '\u001b[';

var CONTROL = {
	up				: 'A',
	down			: 'B',

	forward			: 'C',
	right			: 'C',

	back			: 'D',
	left			: 'D',

	nextLine		: 'E',
	prevLine		: 'F',
	horizAbsolute	: 'G',

	//
	//	CSI [ p1 ] J
	//	Erase in Page / Erase Data
	//	Defaults: p1 = 0
	//	Erases from the current screen according to the value of p1
	//	0 - Erase from the current position to the end of the screen.
	//	1 - Erase from the current position to the start of the screen.
	//	2 - Erase entire screen.  As a violation of ECMA-048, also moves
	//	    the cursor to position 1/1 as a number of BBS programs assume
	//		this behaviour.
	//	Erased characters are set to the current attribute.
	//
	//	Support:
	//	* SyncTERM: Works as expected
	//	* NetRunner: Always clears a screen *height* (e.g. 25) regardless of p1
	//	  and screen remainder
	//
	eraseData		: 'J',

	eraseLine		: 'K',
	insertLine		: 'L',

	//
	//	CSI [ p1 ] M
	//	Delete Line(s) / "ANSI" Music
	//	Defaults: p1 = 1
	//	Deletes the current line and the p1 - 1 lines after it scrolling the
	//	first non-deleted line up to the current line and filling the newly
	//	empty lines at the end of the screen with the current attribute.
	//	If "ANSI" Music is fully enabled (CSI = 2 M), performs "ANSI" music
	//	instead.
	//	See "ANSI" MUSIC section for more details.
	//
	//	Support:
	//	* SyncTERM: Works as expected
	//	* NetRunner: 	
	//
	//	General Notes:
	//	See also notes in bansi.txt and cterm.txt about the various
	//	incompatibilities & oddities around this sequence. ANSI-BBS
	//	states that it *should* work with any value of p1.
	//
	deleteLine		: 'M',
	ansiMusic		: 'M',

	scrollUp		: 'S',
	scrollDown		: 'T',
	setScrollRegion	: 'r',
	savePos			: 's',
	restorePos		: 'u',
	queryPos		: '6n',
	queryScreenSize	: '255n',	//	See bansi.txt
	goto			: 'H',	//	row Pr, column Pc -- same as f
	gotoAlt			: 'f',	//	same as H

	blinkToBrightIntensity : '?33h',
	blinkNormal				: '?33l',

	emulationSpeed	: '*r',	//	Set output emulation speed. See cterm.txt

	hideCursor		: '?25l',	//	Nonstandard - cterm.txt
	showCursor		: '?25h',	//	Nonstandard - cterm.txt

	queryDeviceAttributes	: 'c',	//	Nonstandard - cterm.txt

	//	:TODO: see https://code.google.com/p/conemu-maximus5/wiki/AnsiEscapeCodes
	//	apparently some terms can report screen size and text area via 18t and 19t
};

//
//	Select Graphics Rendition
//	See http://cvs.synchro.net/cgi-bin/viewcvs.cgi/*checkout*/src/conio/cterm.txt
//
var SGRValues = {
	reset			: 0,
	bold			: 1,
	dim				: 2,
	blink			: 5,
	fastBlink		: 6,
	negative		: 7,
	hidden			: 8,

	normal			: 22,	//	
	steady			: 25,
	positive		: 27,

	black			: 30,
	red				: 31,
	green			: 32,
	yellow			: 33,
	blue			: 34,
	magenta			: 35,
	cyan			: 36,
	white			: 37,

	blackBG			: 40,
	redBG			: 41,
	greenBG			: 42,
	yellowBG		: 43,
	blueBG			: 44,
	magentaBG		: 45,
	cyanBG			: 46,
	whiteBG			: 47,
};

function getFGColorValue(name) {
	return SGRValues[name];
}

function getBGColorValue(name) {
	return SGRValues[name + 'BG'];
}


//	See http://cvs.synchro.net/cgi-bin/viewcvs.cgi/*checkout*/src/conio/cterm.txt
//	:TODO: document
//	:TODO: Create mappings for aliases... maybe make this a map to values instead
//	:TODO: Break this up in to two parts:
//	1) FONT_AND_CODE_PAGES (e.g. SyncTERM/cterm)
//	2) SAUCE_FONT_MAP: Sauce name(s) -> items in FONT_AND_CODE_PAGES. 
//	...we can then have getFontFromSAUCEName(sauceFontName)
//	Also, create a SAUCE_ENCODING_MAP: SAUCE font name -> encodings

//
//	An array of CTerm/SyncTERM font/encoding values. Each entry's index
//	corresponds to it's escape sequence value (e.g. cp437 = 0)
//
//	See https://github.com/protomouse/synchronet/blob/master/src/conio/cterm.txt
//
var SYNCTERM_FONT_AND_ENCODING_TABLE = [
	'cp437',
	'cp1251', 
	'koi8_r', 
	'iso8859_2', 
	'iso8859_4', 
	'cp866',
	'iso8859_9', 
	'haik8', 
	'iso8859_8', 
	'koi8_u', 
	'iso8859_15', 
	'iso8859_4',
	'koi8_r_b', 
	'iso8859_4', 
	'iso8859_5', 
	'ARMSCII_8', 
	'iso8859_15',
	'cp850', 
	'cp850', 
	'cp885', 
	'cp1251', 
	'iso8859_7', 
	'koi8-r_c',
	'iso8859_4', 
	'iso8859_1', 
	'cp866', 
	'cp437', 
	'cp866', 
	'cp885',
	'cp866_u', 
	'iso8859_1', 
	'cp1131', 
	'c64_upper', 
	'c64_lower',
	'c128_upper', 
	'c128_lower', 
	'atari', 
	'pot_noodle', 
	'mo_soul',
	'microknight_plus', 
	'topaz_plus',
	'microknight',
	'topaz',
];

//
//	A map of various font name/aliases such as those used
//	in SAUCE records to SyncTERM/CTerm names
//
//	This table contains lowercased entries with any spaces
//	replaced with '_' for lookup purposes.
//
var FONT_ALIAS_TO_SYNCTERM_MAP = {
	'cp437'					: 'cp437',
	'ibm_vga'				: 'cp437',
	'ibmpc'					: 'cp437',
	'ibm_pc'				: 'cp437',
	'pc'					: 'cp437',
	'cp437_art'	 			: 'cp437',
	'ibmpcart'				: 'cp437',
	'ibmpc_art'				: 'cp437',
	'ibm_pc_art'			: 'cp437',
	'msdos_art'				: 'cp437',
	'msdosart'				: 'cp437',
	'pc_art'				: 'cp437',
	'pcart'					: 'cp437',

	'ibm_vga50'				: 'cp437',
	'ibm_vga25g'			: 'cp437',
	'ibm_ega'				: 'cp437',
	'ibm_ega43'				: 'cp437',

	'topaz'					: 'topaz',
	'amiga_topaz_1'			: 'topaz',
	'amiga_topaz_1+'		: 'topaz_plus',
	'topazplus'				: 'topaz_plus',	
	'topaz_plus'			: 'topaz_plus',
	'amiga_topaz_2'			: 'topaz',
	'amiga_topaz_2+'		: 'topaz_plus',
	'topaz2plus'			: 'topaz_plus',

	'pot_noodle'			: 'pot_noodle',
	'p0tnoodle'				: 'pot_noodle',
	'amiga_p0t-noodle'		: 'pot_noodle',

	'mo_soul'				: 'mo_soul',
    'mosoul'				: 'mo_soul',
    'mO\'sOul'				: 'mo_soul',

	'amiga_microknight'		: 'microknight',
	'amiga_microknight+'	: 'microknight_plus',


	'atari'					: 'atari',
	'atarist'				: 'atari',

};

function setSyncTERMFont(name, fontPage) {
	var p1 = miscUtil.valueWithDefault(fontPage, 0);

	assert(p1 >= 0 && p1 <= 3);

	var p2 = SYNCTERM_FONT_AND_ENCODING_TABLE.indexOf(name);
	if(p2 > -1) {
		return ESC_CSI + p1 + ';' + p2 + ' D';
	}

	return '';
}

function getSyncTERMFontFromAlias(alias) {
	return FONT_ALIAS_TO_SYNCTERM_MAP[alias.toLowerCase().replace(/ /g, '_')];
}

var DEC_CURSOR_STYLE = {
	'blinking block'	: 0,
	'default'			: 1,
	'steady block'		: 2,
	'blinking underline'	: 3,
	'steady underline'	: 4,
	'blinking bar'		: 5,
	'steady bar'		: 6,
};

function setCursorStyle(cursorStyle) {
	var ps = DEC_CURSOR_STYLE[cursorStyle];
	if(ps) {
		return ESC_CSI + ps + ' q';
	}
	return '';
	
}

//	Create methods such as up(), nextLine(),...
Object.keys(CONTROL).forEach(function onControlName(name) {
	var code = CONTROL[name];

	exports[name] = function() {
		var c = code;
		if(arguments.length > 0) {
			//	arguments are array like -- we want an array
			c = Array.prototype.slice.call(arguments).map(Math.round).join(';') + code;
		}
		return ESC_CSI + c;
	};
});

//	Create various color methods such as white(), yellowBG(), reset(), ...
Object.keys(SGRValues).forEach(function onSgrName(name) {
	var code = SGRValues[name];

	exports[name] = function() {
		return ESC_CSI + code + 'm';
	};
});

function sgr() {
	//
	//	- Allow an single array or variable number of arguments
	//	- Each element can be either a integer or string found in SGRValues
	//	  which in turn maps to a integer
	//
	if(arguments.length <= 0) {
		return '';
	}
	
	var result = '';

	//	:TODO: this method needs a lot of cleanup!

	var args = Array.isArray(arguments[0]) ? arguments[0] : arguments;
	for(var i = 0; i < args.length; i++) {
		if(typeof args[i] === 'string') {
			if(args[i] in SGRValues) {
				if(result.length > 0) {
					result += ';';
				}
				result += SGRValues[args[i]];
			}
		} else if(typeof args[i] === 'number') {			
			if(result.length > 0) {
				result += ';';
			}
			result += args[i];
		}
	}
	return ESC_CSI + result + 'm';
}

//
//	Converts a Graphic Rendition object used elsewhere
//	to a ANSI SGR sequence.
//
function getSGRFromGraphicRendition(graphicRendition, initialReset) {
	var sgrSeq = [];

	var styleCount = 0;
	[ 'intensity', 'underline', 'blink', 'negative', 'invisible' ].forEach(function style(s) {
		if(graphicRendition[s]) {
			sgrSeq.push(graphicRendition[s]);
			++styleCount;
		}
	});

	if(!styleCount) {
		sgrSeq.push(0);
	}

	if(graphicRendition.fg) {
		sgrSeq.push(graphicRendition.fg);
	}

	if(graphicRendition.bg) {
		sgrSeq.push(graphicRendition.bg);
	}

	if(initialReset) {
		sgrSeq.unshift(0);
	}

	return sgr(sgrSeq);
}

///////////////////////////////////////////////////////////////////////////////
//	Shortcuts for common functions
///////////////////////////////////////////////////////////////////////////////

function clearScreen() {
	return exports.eraseData(2);
}

function resetScreen() {
	return exports.reset() + exports.eraseData(2) + exports.goHome();
}

function normal() {
	return sgr(['normal', 'reset']);
}

function goHome() {
	return exports.goto();	//	no params = home = 1,1
}

//
//	Delete line(s)
//	This method acts like ESC[ p1 M but should work
//	for all terminals via using eraseLine and movement
//
/*
function deleteLine(count) {
	count = count || 1;

	console.log(exports.eraseLine)
	var seq = exports.eraseLine(2);	// 2 = entire line
	var i;
	for(i = 1; i < count; ++i) {
		seq += 
			'\n' + 					//	down a line
			exports.eraseLine(2);	//	erase it
	}
	
	//	now, move back up any we lines we went down
	if(count > 1) {
		seq += exports.up(count - 1);
	}
	return seq;
}
*/

//
//	See http://www.termsys.demon.co.uk/vtANSI_BBS.htm
//
function disableVT100LineWrapping() {
	return ESC_CSI + '7l';
}

function setEmulatedBaudRate(rate) {
	var speed = {
		unlimited	: 0,
		off			: 0,
		0			: 0,
		300			: 1,
		600			: 2,
		1200		: 3,
		2400		: 4,
		4800		: 5,
		9600		: 6,
		19200		: 7,
		38400		: 8,
		57600		: 9,
		76800		: 10,
		115200		: 11,
	}[rate] || 0;
	return 0 === speed ? exports.emulationSpeed() : exports.emulationSpeed(1, speed);
}

