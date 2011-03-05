/*
jComponent

DRY library for declaratively specifying interactive web UIs -- like HTML, but better
https://github.com/jphaas/jComponent

Copyright 2011, Joshua Haas
Licensed under the MIT license.
License: https://github.com/jphaas/jComponent/raw/master/LICENSE.txt

Depends on:
jQuery (Tested: 1.4.2, not tested on other versions) -- http://jquery.com/
jQuery validate plugin (Tested: 1.7, not tested on other versions) -- http://bassistance.de/jquery-plugins/jquery-plugin-validation/

Installation:
<script src="http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js"></script>
<script src="http://ajax.microsoft.com/ajax/jquery.validate/1.7/jquery.validate.min.js"></script>
<script src="jComponent.0.1.js"></script>
Optionally, insert a stylesheet:
<link rel="stylesheet" type="text/css" href="demo/jCom_theme_default.css" />

*/


/*
<?depends /jwl_lib/jquery.1.4.2.min.js?>
<?depends /jwl_lib/jquery.validate.min.js?>
*/

function inherit(o) {
    function F() {  }
    F.prototype = o;
    return new F();
}

function generate_guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

j = function() {

    //cloning js objects is tricky.  this function only purports to work for Elements; used by the Set object to generate new instances of children
    //will die a horrible recursive death if there are circular references
    element_clone = function(obj) {
      var newObj = (this instanceof Array) ? [] : {};
      for (i in obj) {
        if (obj[i] && typeof obj[i] == "object") {
          newObj[i] = element_clone(obj[i]);
        } else newObj[i] = obj[i]
      } return newObj;
    };

    //special remove based on the idea that identity is determined by ID
    function arrayRemove(array, id, noerr)
    {
        var index = -1;
        $.each(array, function(i, element)
        {
            if (element.id == id) {index = i; return false;}
        });
        if (index == -1) 
        { if (!noerr) {throw "item " + item + " not found in array " + repr(array);} }
        else {
            array.splice(index, 1);
        }
    }

    j = {};
    
    j.Element = {}
    j.Element.is_element = true;
    
    function _capture_args()
    {
        var slice;
        if (typeof(arguments[0]) == typeof({}) && !arguments[0].is_element) {
            this.config = arguments[0];
            slice = 1;
        }
        else {
            this.config = {};
            slice = 0;
        }
        this.children = $.map($.makeArray(arguments).slice(slice), function(child) { 
            return typeof(child) == 'string' ? j.TextSpan(child) : child;
        });
    }
    
    j.Element.construct = function(){

    }
    
    var _TextSpan = inherit(j.Element);
    _TextSpan.render = function(context) {
        this.context = context;
        if (this.plaintext) { return this.content; }
        return $('<span>' + this.content + '</span>'); 
    }
    
    function push_context(old, property, object)
    {
        var new_context = inherit(old);
        new_context[property] = object;
        return new_context;
    }
    
    var _SimpleHTML = inherit(j.Element);
    _SimpleHTML.render = function(context) {
        this.context = context;
        if (this.config.align == 'center') { 
            this.styles['margin-left'] = 'auto'; 
            this.styles['margin-right'] = 'auto'; 
        }
        if (this.config.align == 'left' || this.config.align == 'right') { this.styles.float = this.config.align; }
        this.tag = $('<' + this.tagname + '>');
        var mytag = this.tag;
        $.each(this.attributes, function(attname, attvalue) { mytag.attr(attname, attvalue); });
        $.each(this.classes, function(index, classname) { mytag.addClass(classname); });
        $.each(this.styles, function(stylename, stylevalue) { mytag.css(stylename, stylevalue); });
        for (e in this.events)
        {
            this.tag.bind(e, this.events[e]);
        }
        ctx = context;
        if (this.custom_context)
        {
            ctx = push_context(ctx, this.custom_context_name, this.custom_context());
        }
        $.each(this.children, function(index, child) { mytag.append(child.render(ctx)); });
        if (this.custom_render) { this.custom_render(ctx); }
        this.tag.data('j_owner', this);
        return this.tag;
    }
    
    function _init_simple(obj, tagname, classname)
    {
        obj.tagname = tagname;
        obj.attributes = {};
        if (!obj.config) { obj.config = {}; }
        if (!obj.children) {obj.children = []; }
        obj.events = {};
        obj.classes = classname ? [classname] : [];
        if (obj.config.class)
        {
            if ($.isArray(obj.config.class)) { obj.classes.push.apply(obj.classes, obj.config.class); }
            else {obj.classes.push(obj.config.class);}
        }
        obj.styles = {};
    }
    
    j.SimpleHTML = function(tagname, classname, postprocess) { return function()
        {     
            var obj = inherit(_SimpleHTML);
            _capture_args.apply(obj, arguments);
            _init_simple(obj, tagname, classname);
            if (postprocess) { postprocess(obj); }
            return obj;
        }
    }
    
    _BindList = {};
    _BindList.bind = function(target)
    {
        this.bound.push(target);
    }
    _BindList.update = function(){
        $.each(this.bound, function(index, bound) { bound.refresh(); });  //replace with a more granular signal, such as "append", "remove"?
    }
    _BindList.append = function(item){
        this.content.push(item);
        this.update();
    }
    _BindList.remove = function(item){
        arrayRemove(this.content, item.id);
        this.update();
    }
    j.BindList = function() { 
        var bl = inherit(_BindList)
        bl.content = [];
        bl.bound = [];
        return bl; 
    }
    
    
    var _Set = inherit(j.Element);
    _Set.render = function(old_context) {
        this.parent_context = old_context;
        this.refresh();
        return this.tag;
    }
    _Set.refresh = function() {
        this.tag.empty();
        var me = this;
        $.each(this.bindlist.content, function(index, item)
        {
            new_context = push_context(me.parent_context, "set", {value: item, set: me, bindlist: me.bindlist});
            $.each(me.children, function(index, child) 
            { 
                clone = element_clone(child);
                me.tag.append(clone.render(new_context)); 
            });
        });  
    }
    
    j.Set = function(text) {
        var obj = inherit(_Set);
        _capture_args.apply(obj, arguments);
        obj.bindlist = obj.config.bind;
        obj.bindlist.bind(obj);
        obj.tag = $('<div class="j_set"></div>');
        return obj;
    }
    
    var _Ref = inherit(j.Element);
    _Ref.render = function(context)
    {
        return context.set.value[this.property];
    }
    j.Ref = function(property) { 
        var ref = inherit(_Ref);
        ref.property = property;
        return ref;
    }
    
    j.RemoveButton = function(text)
    {
        var obj = inherit(_SimpleHTML);
        _init_simple(obj, 'span', 'j_remove-button');
        obj.children = [j.PlainText(text)];
        obj.events.click = function() {
            $(this).data('j_owner').context.set.bindlist.remove($(this).data('j_owner').context.set.value);
        }
        return obj;
    }
    
    j.TextSpan = function(text) {
        var obj = inherit(_TextSpan);
        obj.content = text;
        return obj;
    }
    
    j.PlainText = function(text) {
        var obj = inherit(_TextSpan);
        obj.content = text;
        obj.plaintext = true;
        return obj;
    }

    j.H1 = j.SimpleHTML('H1');
    j.H2 = j.SimpleHTML('H2');
    j.H3 = j.SimpleHTML('H3');
    j.H4 = j.SimpleHTML('H4');
    j.H5 = j.SimpleHTML('H5');
    j.H6 = j.SimpleHTML('H6');
    
    j.P = j.SimpleHTML('P');
    
    j.ContentBox = j.SimpleHTML('div', 'j_ContentBox');

    j.Line = j.SimpleHTML('div', 'j_line');
    
    j.A = j.SimpleHTML('A', 'j_A', function(obj)
    {
        obj.attributes.href = obj.config.href;
    });
    
    j.Img = j.SimpleHTML('img', 'j_Img', function(obj)
    {
        obj.attributes.src = obj.config.src;
    });

    j.Form = j.SimpleHTML('form', 'j_form', function(obj)
    {
        obj.custom_render = function() {
            var me = this;
            this.tag.validate( { submitHandler: function()
            {
                var form_data = {}
                var inputs = me.tag.find('input, textarea, select');
                inputs.each(function(index, element)
                {
                    if ($(element).data('j_owner')) {form_data[$(element).attr('name')] = $(element).data('j_owner').get_value(); }
                });
                me.config.action(form_data);
                return false
            }});
        }
    });
    

    j.Submit = function(text)
    {
        var obj = inherit(_SimpleHTML);
        _init_simple(obj, 'input', 'j_submit');
        obj.config = {};
        obj.children = [];
        obj.attributes.type = 'submit';
        obj.attributes.value = text;
        obj.attributes.name = 'submit';
        obj.get_value = function() { return text; }
        return obj;
    }
    
    j.Choice = j.SimpleHTML('option', 'j_choice', function(obj) 
    { 
        obj.attributes.value = obj.config.value;
    });
    
    j.Input = function()
    {
        var obj = inherit(_SimpleHTML);
        _capture_args.apply(obj, arguments);
        _init_simple(obj, 'input', 'j_input');
        if (obj.config.type == 'textarea') { obj.tagname = 'textarea' }
        if (obj.config.type == 'dropdown')
        {
            obj.tagname = 'select';
            $.each(obj.config.choices, function(index, choice) {
                obj.children.push(j.Choice({value: choice}, j.PlainText(choice)));
            });
        }
        obj.attributes.name = obj.config.name;
        obj.get_value = function() { 
            return obj.tag.val();  //this is where I'll put conversion code (ie, turn numbers from strings to numbers)
        } 
        return obj;
    }
    
    j.Layout = j.SimpleHTML('div', 'j_layout', function(obj)
    {
        if (obj.config.width) 
        { 
            if (obj.config.chunks) 
            {
                if (!obj.config.gap) {obj.config.gap = 0 }
                obj.config.chunk_size = (obj.config.width - 
                    (obj.config.gap * (obj.config.chunks - 1))) / obj.config.chunks;
            }
            obj.styles.width = obj.config.width;
        }
        obj.config.align = obj.config.align ? obj.config.align : 'center';
        obj.custom_context_name = "Layout";
        obj.custom_context = function()
        {
            return {chunk_size: this.config.chunk_size, gap: this.config.gap, first: true};
        }
    });
    
    
    j.Column = j.SimpleHTML('div', 'j_column', function(obj)
    {
        obj.custom_render = function(context)
        {
            if (context.Layout && context.Layout.chunk_size && this.config.span)
            {
                if (context.Layout.first || this.config.no_left)
                {
                    this.config.no_left = true;
                    context.Layout.first = false;
                    this.tag.css('margin-left', 0);
                }
                else
                {
                    this.tag.css('margin-left', context.Layout.gap);
                }
                this.tag.css('margin-right', 0);
                this.tag.css('width', context.Layout.chunk_size * this.config.span + 
                    context.Layout.gap * (this.config.span - 1));
                this.tag.css('float', 'left');
            }
        }
    });

    j.Root = function(root_element)
    {
        $(document).ready(function()
        {
            $(document.body).append(root_element.render({}));
        });
    }
       
    return j;
}();