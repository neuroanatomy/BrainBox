var date_format=function(e,d){$(e).text(new Date(d).toLocaleString())};

// 2-way binding
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
// 1-way (bottom-up) binding
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
function unbind2(proxy,path) {
	delete proxy[path];
}
