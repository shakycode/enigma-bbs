/* jslint node: true */
'use strict';

var Config		= require('./config.js').config;

var _			= require('lodash');
var assert		= require('assert');

exports.parseAsset				= parseAsset;
exports.getAssetWithShorthand	= getAssetWithShorthand;
exports.getArtAsset				= getArtAsset;
exports.getModuleAsset			= getModuleAsset;
exports.resolveConfigAsset		= resolveConfigAsset;
exports.getViewPropertyAsset	= getViewPropertyAsset;

var ALL_ASSETS = [
	'art',
	'menu',
	'method',
	'systemMethod',
	'systemModule',
	'prompt',
	'config',
];

var ASSET_RE = new RegExp('\\@(' + ALL_ASSETS.join('|') + ')\\:([\\w\\d\\.]*)(?:\\/([\\w\\d\\_]+))*');

function parseAsset(s) {	
	var m = ASSET_RE.exec(s);

	if(m) {
		var result = { type : m[1] };

		if(m[3]) {
			result.location = m[2];
			result.asset	= m[3];
		} else {
			result.asset	= m[2];
		}

		return result;
	}
}

function getAssetWithShorthand(spec, defaultType) {
	if(!_.isString(spec)) {
		return null;
	}

	if('@' === spec[0]) {
		var asset = parseAsset(spec);
		assert(_.isString(asset.type));

		return asset;
	} else {
		return {
			type	: defaultType,
			asset	: spec,
		}
	}
}

//	:TODO: Convert these to getAssetWithShorthand()
function getArtAsset(art) {
	if(!_.isString(art)) {
		return null;
	}

	if('@' === art[0]) {
		var artAsset = parseAsset(art);
		assert('art' === artAsset.type || 'method' === artAsset.type);

		return artAsset;
	} else {
		return {
			type	: 'art',
			asset	: art,
		};
	}
}

function getModuleAsset(module) {
	if(!_.isString(module)) {
		return null;
	}

	if('@' === module[0]) {
		var modAsset = parseAsset(module);
		assert('module' === modAsset.type || 'systemModule' === modAsset.type);

		return modAsset;
	} else {
		return {
			type	: 'module',
			asset	: module,
		}
	}
}

function resolveConfigAsset(from) {
	var asset = parseAsset(from);
	if(asset) {
		assert('config' === asset.type);

		var path = asset.asset.split('.');
		var conf = Config;
		for(var i = 0; i < path.length; ++i) {
			if(_.isUndefined(conf[path[i]])) {
				return from;
			}
			conf = conf[path[i]];
		}
		return conf;
	} else {
		return from;
	}
}

function getViewPropertyAsset(src) {
	if(!_.isString(src) || '@' !== src.charAt(0)) {
		return null;
	}

	return parseAsset(src);
};
