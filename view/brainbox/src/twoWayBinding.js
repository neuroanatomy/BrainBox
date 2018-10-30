/*! Two-Way Binding */
import DOMPurify from '../../downloads/purify.min.js';

/**
 * @page Two-Way Binding
 */

export const date_format = function(e, d) {
    e.get(0).textContent = new Date(d).toLocaleDateString()
};

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
 * @function bind2
 * @desc Bind a javascript object with a DOM element and viceversa
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {object} original The source object to bind
 * @param {string} path Path to the property in the original object to bind
 * @param {string} el Selector for the element in the DOM to bind
 * @param {formatFunction} Transformation between the object property's value and the result displayed in the DOM element
 * @param {parseFunction} Transformation between the DOM element's value and what will be stored in the object's property
 */
<<<<<<< HEAD:view/brainbox/src/twoWayBinding.js
export function bind2(proxy,original,path,el,format,parse) {
    var i,k=path.split("."),o=original;
    for(i=0;i<k.length-1;i++)
=======
function bind2(proxy,original,path,el,format,parse) {
	var i,k=path.split("."),o=original;
	for(i=0;i<k.length-1;i++)
>>>>>>> master:public/js/twoWayBinding.js
        o=o[k[i]];
	Object.defineProperty(proxy,path,{
		get: function(){
		    var v;
			if(parse) {
                v=parse(el,o[k[i]]);
<<<<<<< HEAD:view/brainbox/src/twoWayBinding.js
            } else {
                v=el.get(0).textContent;
            }
            o[k[i]]=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');
            return o[k[i]];
        },
        set: function(v) {
            v=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');
            o[k[i]]=v;
            if(format)
                format(el,v);
            else
                el.get(0).textContent = v;
        },
        configurable: true,
        enumerable: true
    });
    proxy[path]=o[k[i]];
=======
			} else {
				v=$(el).text();
			}
            o[k[i]]=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');
			return o[k[i]];
		},
		set: function(v) {
		    v=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');
			o[k[i]]=v;
			if(format)
				format(el,v);
			else
				$(el).text(v);
		},
		configurable: true,
		enumerable: true
	});
	proxy[path]=o[k[i]];
>>>>>>> master:public/js/twoWayBinding.js
}

/**
 * @function bind1
 * @desc Bind the content of a DOM element to javascript object, but not the other way around
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {object} original The source object to bind
 * @param {string} path Path to the property in the original object to bind
 * @param {string} el Selector for the element in the DOM to bind
 * @param {formatFunction} Transformation between the object property's value and the result displayed in the DOM element
 */
<<<<<<< HEAD:view/brainbox/src/twoWayBinding.js
export function bind1(proxy,original,path,el,format) {
    var i,k=path.split("."),o=original;
    for(i=0;i<k.length-1;i++)
        o=o[k[i]];
    Object.defineProperty(proxy,path,{
        get: function(){
            return DOMPurify.sanitize(o[k[i]]);
        },
        set: function(v) {
            v=DOMPurify.sanitize(v);
            o[k[i]]=v;
            if(format)
                format(el,v);
            else
                el.get(0).textContent = v;
        },
        configurable: true,
        enumerable: true
    });
    proxy[path]=o[k[i]];
=======
 function bind1(proxy,original,path,el,format) {
	var i,k=path.split("."),o=original;
	for(i=0;i<k.length-1;i++)
		o=o[k[i]];
	Object.defineProperty(proxy,path,{
		get: function(){
			return DOMPurify.sanitize(o[k[i]]);
		},
		set: function(v) {
		    v=DOMPurify.sanitize(v);
			o[k[i]]=v;
			if(format)
				format(el,v);
			else
				$(el).text(v);
		},
		configurable: true,
		enumerable: true
	});
	proxy[path]=o[k[i]];
>>>>>>> master:public/js/twoWayBinding.js
}

/**
 * @function unbind2
 * @desc Unbind a javascript object and a DOM element
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {string} path Path to the property in the original object to bind
 */
<<<<<<< HEAD:view/brainbox/src/twoWayBinding.js
export function unbind2(proxy,path) {
    delete proxy[path];
=======
 function unbind2(proxy,path) {
	delete proxy[path];
>>>>>>> master:public/js/twoWayBinding.js
}

/**
 * @function resetBindingProxy
 * @desc Reinitialise a proxy object with stored values
 * @param {object} param Object providing the template for an array, includes an
 *                 object template, for all the objects in each row of the array,
 *                 and the bound object array.
 * @param {object} stored A reference version of the object array, to which the
 *                 current object array will be reseted.
 */
export function resetBindingProxy(param, stored) {
    var i, j, k = 0, flag = true;
    var o, ot = param.objTemplate;
    
    while(flag) {
        for(i=0;i<ot.length;i++) {
            var path = ot[i].path;
            var keys = path.split(".");
            o = stored;
            for(j=0;j<keys.length;j++) {
                if(keys[j] === '#') {
                    o=o[k];
                    if(o === undefined) {
                        return;
                    }
                } else {
                    o=o[keys[j]];
                }
            }
            param.info_proxy[path.replace('#',k)] = o;
        }
        k++;
    }
}

