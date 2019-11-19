/*! Two-Way Binding */
import DOMPurify from 'dompurify';

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
 * @param {function} format Transformation between the object property's value and the result displayed in the DOM element
 * @param {function} parse Transformation between the DOM element's value and what will be stored in the object's property
 * @returns {object} Bound object
 */
export function bind2(proxy, original, path, el, format, parse) {
    var i;
    var k=path.split(".");
    var o=original;
    for(i=0; i<k.length-1; i++) { o=o[k[i]]; }
    Object.defineProperty(proxy, path, {
        get: function() {
            var v;
            if(parse) {
                v=parse(el, o[k[i]]);
            } else {
                v=el.get(0).textContent;
            }
            o[k[i]]=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');

            return o[k[i]];
        },
        set: function(v) {
            v=JSON.parse(DOMPurify.sanitize(JSON.stringify(v))||'""');
            o[k[i]]=v;
            if(format) {
                format(el, v);
            } else {
                el.get(0).textContent = v;
            }
        },
        configurable: true,
        enumerable: true
    });
    proxy[path]=o[k[i]];
}

/**
 * @function bind1
 * @desc Bind the content of a DOM element to javascript object, but not the other way around
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {object} original The source object to bind
 * @param {string} path Path to the property in the original object to bind
 * @param {string} el Selector for the element in the DOM to bind
 * @param {function} format Transformation between the object property's value and the result displayed in the DOM element
 * @returns {object} Sanitised result
 */
export function bind1(proxy, original, path, el, format) {
    var i;
    var k=path.split(".");
    var o=original;
    for(i=0; i<k.length-1; i++) { o=o[k[i]]; }
    Object.defineProperty(proxy, path, {
        get: function() {
            return DOMPurify.sanitize(o[k[i]]);
        },
        set: function(v) {
            v=DOMPurify.sanitize(v);
            o[k[i]]=v;
            if(format) {
                format(el, v);
            } else {
                el.get(0).textContent = v;
            }
        },
        configurable: true,
        enumerable: true
    });
    proxy[path]=o[k[i]];
}

/**
 * @function unbind2
 * @desc Unbind a javascript object and a DOM element
 * @param {object} proxy The object that will bind the source object and the DOM element
 * @param {string} path Path to the property in the original object to bind
 * @returns {void}
 */
export function unbind2(proxy, path) {
    delete proxy[path];
}

/**
 * @function resetBindingProxy
 * @desc Reinitialise a proxy object with stored values
 * @param {object} param Object providing the template for an array, includes an
 *                 object template, for all the objects in each row of the array,
 *                 and the bound object array.
 * @param {object} stored A reference version of the object array, to which the
 *                 current object array will be reseted.
 * @returns {void}
 */
export function resetBindingProxy(param, stored) {
    var i, j;
    var k = 0;
    var flag = true;
    var o;
    var ot = param.objTemplate;

    while(flag) {
        for(i=0; i<ot.length; i++) {
            var path = ot[i].path;
            var keys = path.split(".");
            o = stored;
            for(j=0; j<keys.length; j++) {
                if(keys[j] === '#') {
                    o=o[k];
                    if(typeof o === 'undefined') {
                        return;
                    }
                } else {
                    o=o[keys[j]];
                }
            }
            param.info_proxy[path.replace('#', k)] = o;
        }
        k++;
    }
}

