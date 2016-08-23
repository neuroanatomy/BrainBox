/**
 * @namespace Two-Way Binding
 */

var date_format=function(e,d){$(e).text(new Date(d).toLocaleDateString())};

/*
 * @callback formatFunction
 * @param {string} el DOM element
 * @param {object} v Property's value
 */

/*
 * @callback parseFunction
 * @param {string} el DOM element
 * @return {object} v Parsed value
 */

/**
 * Bind a javascript object with a DOM element and viceversa
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {object} original The source object to bind
 * @param {string} path Path to the property in the original object to bind
 * @param {string} el Selector for the element in the DOM to bind
 * @param {formatFunction} Transformation between the object property's value and the result displayed in the DOM element
 * @param {parseFunction} Transformation between the DOM element's value and what will be stored in the object's property
 */
function bind2(proxy,original,path,el,format,parse) {
	var i,k=path.split("."),o=original;
	for(i=0;i<k.length-1;i++)
		o=o[k[i]];
	Object.defineProperty(proxy,path,{
		get: function(){
			if(parse)
				o[k[i]]=parse(el);
			else
				o[k[i]]=$(el).text();
			return o[k[i]];
		},
		set: function(v) {
			o[k[i]]=v;
			if(format)
				format(el,v);
			else
				$(el).text(v);
		},
		enumerable:true
	});
	proxy[path]=o[k[i]];
}

/**
 * Bind the content of a DOM element to javascript object, but not the other way around
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {object} original The source object to bind
 * @param {string} path Path to the property in the original object to bind
 * @param {string} el Selector for the element in the DOM to bind
 * @param {formatFunction} Transformation between the object property's value and the result displayed in the DOM element
 */
 function bind1(proxy,original,path,el,format) {
	var i,k=path.split("."),o=original;
	for(i=0;i<k.length-1;i++)
		o=o[k[i]];
	Object.defineProperty(proxy,path,{
		get: function(){
			return o[k[i]];
		},
		set: function(v) {
			o[k[i]]=v;
			if(format)
				format(el,v);
			else
				$(el).text(v);
		},
		enumerable:true
	});
	proxy[path]=o[k[i]];
}

/**
 * Unbind a javascript object and a DOM element
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {string} path Path to the property in the original object to bind
 */
 function unbind2(proxy,path) {
	delete proxy[path];
}
