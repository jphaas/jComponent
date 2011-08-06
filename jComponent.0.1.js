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

*/


/*
<?depends /jquery.1.4.2.min.js?>
<?depends /jquery.validate.min.js?>
*/


/*

Notes:
-Pre-process config for bindables before exposing to object
-Allow for passing in lists of children
-Make functions take named parameters instead of individual items


** Interfaces (implicit):

Scope 
    A dictionary mapping names to bindables
    
Component
    .make(scope: Scope): returns a new Instance.  Typically, will call make on child Components and append their .instances
    .is_component: equals true
    .component_type: type of component, mostly for debugging purposes
    .children: a list of Components
    
Instance
    .canvas: is a jQuery object that can be inserted into the DOM.
    .canvas.data('j_owner') should equal the instance
    
Bindable
    .make(scope: Scope): returns a bindable (could be itself for globally defined data, could be a different bindable for references)
    .bind(instance: Instance): adds Instance to notification list
    .sub(property) - returns a new bindable that's bound to the given property of the current bindable
    .get() - returns the value of the bindable
    .set(value): changes the bindable's value to value
    .add(value): adds value to the bindable (only works for lists)
    .remove(value): removes value from the bindable (only works for lists)
    .remove(value, property): removes value from the bindable, comparing for equality by using value[property] = value2[property] (only works for lists)
    .is_a_bindable = true
    
Config: a dictionary of key/value pairs
    
Constructor([config: Config], child1: Component, child2: Component...): given an optional Config, and a list of child components, returns
    a new Component
    
SimpleConstructor(config: Config, children: [Component]):
    returns a Component.  Like Constructor, but config is mandatory (can be {}), and children is an array, instead
    of comma-seperated arguments.

    
** Building Components:

j.lookup(scope, exp) -- takes an expression of the form "object.property.property" and looks it up in the given scope, returning a Bindable



j.construct(sc: SimpleConstructor): returns a Constructor that wraps sc

j.componentFromMaker(maker(scope, config, children)) : returns a Constructor that generates a component c
    such that c.make(scope) calls maker(scope, config, children).

j.simpleInstance(html, classes, attributes, styles, events, children, scope, auto_config):
    returns a new Instance.  Starts with jQuery's $(html), adds on the classes, styles, events, and attributes.
    children should be jQuery objects.
    auto_config should be a key/value dictionary (typically the Component's config object): if present,
    goes through j.auto_config (see below) to add to classes, styles, event, and attributes.

j.auto_config: a list of functions of the form func(config, classes, styles, events, attributes).  This is a mechanism
    for inserting config elements that cut across multiple components.  You can insert additional functions into this 
    list to add new config keys to watch for.  Functions should directly update the passed in lists (classes, styles, events, and attributes):
    they should not have a return value.

j.childize(scope, children) : given a list of child components and a given scope, creates new instances of the components and returns their canvases
    
j.HTMLComponent(html, classes, attributes, styles, events): helper function for generating straightforward components that don't 
require customization based on the values of config
    

** Data model

j.Bind(data) -- returns a Bindable that wraps the data.  Used outside the scope of the page structure declaration.

j.Ref(exp) -- takes an expression of the form 'scope_variable' or 'scope_variable.property.property...' and returns a Bindable 
    derived by looking up the expression in the current scope.
    Can be used as either a bindable or as a component.
    

j.Call(function, exp1, exp2...) -- evaluates expressions in the context of the current scope and calls the function accordingly
    
    
built-in auto_config:
    center, align left/right
    
    
Controls

convention: j_ComponentName gets affixed to them.


j.Span: span without any additional semantic meaning or formatting
    j_Span

j.PlainText(text) - can only contain text, no tags.  Generally don't need to use this because passing in a string as an elements child is equivalent to passing in text
    
*/





j = function() {
 
    //puts a message on the error console
    function log(msg) {
        if (console && console.log) {
            console.log(msg)
        }
        else {
            setTimeout(function() {
                throw new Error(msg);
            }, 0);
        }
    }

    j = {};
    
    j.inherit = function(o) {
        function F() {  }
        F.prototype = o;
        return new F();
    } 


    j.generate_guid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }
    
    j.lookup = function(scope, exp) {
        exp = exp.split('.');
        var cur = scope[exp[0]];
        if (!cur) { throw new Error('could not find variable ' + exp[0] + ' in current scope'); }
        for (i = 1; i < exp.length; i++) {
            cur = cur.sub(exp[i]);
        }
        return cur;
    }
    
    j.construct = function(component_constructor) {
        return function(){
            var slice;
            var config;
            if (typeof(arguments[0]) == typeof({}) && !arguments[0].is_component) {
                config = arguments[0];
                slice = 1;
            } else {
                config = {};
                slice = 0;
            }
            var children = $.map($.makeArray(arguments).slice(slice), function(child) { 
                return typeof(child) == 'string' ? j.PlainText(child) : child;
            });
            return component_constructor(config, children);
        }
    }
    
    j.componentFromMaker = function(type, maker) {
        return j.construct(function(config, children)
        {
            var c = {};
            c.is_component = true;
            c.children = children;
            c.make = function(scope) { return maker(scope, config, children); }
            c.component_type = type;
            return c;
        });
    }
  
    
    j.auto_config = [];
    
    function do_auto_config(auto_config, classes, styles, events, attributes) {
        if (auto_config) {
            $.each(j.auto_config, function(index, func) { func(auto_config, classes, styles, events, attributes); });
        }
    }
  
    //given a function and a value that is either a bindable or a plain value, calls set(value) and sets up binding s.t. set(value) gets called whenever the bindable calls set
    //if scope is given, first makes the bindable in the given scope
    bindToFunc = function(set, value, scope) {
        if (value.is_a_bindable) { 
            if (scope) {
                value = value.make(scope);
            }
            var x = {};
            x.set = set;
            value.bind(x);
            set(value.get());
        } else {
            set(value);
        }
    }
  
    j.simpleInstance = function(html, classes, attributes, styles, events, children, scope, auto_config) {
        var inst = {};
        inst.canvas = $(html);
        var c = inst.canvas;
        c.data('j_owner', inst);
        do_auto_config(auto_config, classes, styles, events, attributes);
        $.each(classes, function(index, classname) { bindToFunc(function(val) { c.addClass(val); }, classname, scope); });
        $.each(attributes, function(attname, attvalue) { bindToFunc(function(val) { c.attr(attname, val); }, attvalue, scope); });
        $.each(styles, function(stylename, stylevalue) { bindToFunc(function(val) { c.css(stylename, val); }, stylevalue, scope); });
        for (var e in events) {
            c.bind(e, events[e]);
        }
        $.each(children, function(index, child) { c.append(child); });
        
        return inst;
    }
    
    j.HTMLComponent = function(html, classes, attributes, styles, events) {
        return j.componentFromMaker(html, function(scope, config, children) {
            return j.simpleInstance(html, classes, attributes, styles, events, j.childize(scope, children), scope, config);
        });
    }
  
    j.auto_config.push(function(config, classes, styles, events, attributes){
        if (config.class && $.isArray(config.class)) { 
            for (var i = 0; i < config.class.length; i++) {
                classes.push(config.class[i]);
            }
        } else if (config.class) {
            classes.push(config.class);
        }
        if (config.width) { styles.width = config.width }
           
        if (config.float == 'center') { 
            styles['margin-left'] = 'auto'; 
            styles['margin-right'] = 'auto'; 
        }
        if (config.float == 'left' || config.float == 'right') { styles.float = config.float; }
        var ta = config.text_align ? config.text_align : config['text-align'];
        if (ta) { styles['text-align'] = ta }
    });
    
    j.childize = function(scope, children) {
        return $.map(children, function(child) { 
            return child.make(scope).canvas; 
        });
    }
    
    //
    // Bindables
    //
      
    //prototype for creating new Bindables, call new = inherit(bind);
    var bind = {};

    //turns a hierarchy of bindables into a hierarchy of plain objects
    function unwrap(bind, cache){
        // if (!cache) { cache = []; }
        // for (var i = 0; i < cache.length; i++) {
            // if (cache[i].key === bind) {
                // return cache[i].value;
            // }
        // }
        
        var obj;
        var v = bind._value;
        if (v == null) {
            obj = null;
        } else if ($.isArray(v)) {
            obj = [];
            for (var i = 0; i < v.length; i++) {
                obj.push(unwrap(v[i], cache));
            }
        } else if (typeof(v) == typeof({})) {
            obj = {};
            for (var attr in v) {
                obj[attr] = unwrap(v[attr], cache);
            }
        } else {
            obj = v;
        }
       
        // cache.push({key: bind, value: obj});
        
        return obj;
    }
    
    //turns a normal object into a hierarchy of bindables
    function wrap(obj, cache) {
        // if (!cache) { cache = []; }
        // for (var i = 0; i < cache.length; i++) {
            // if (cache[i].key === obj) {
                // return cache[i].value;
            // }
        // }
        
        var b = j.inherit(bind);
        if (obj == null) {
            b._value = null;
        } else if ($.isArray(obj)) {
            b._value = [];
            for (var i = 0; i < obj.length; i++) {
                b._value.push(wrap(obj[i], cache));
            }
        } else if (typeof(obj) == typeof({})) {
            b._value = {};
            for (var attr in obj) {
                b._value[attr] = wrap(obj[attr], cache);
            }
        } else {
            b._value = obj;
        }
        b._notify = [];
        
        // cache.push({key: obj}, {value: b});
        
        return b;
    }
    
    
    //bind._value - should contain either a javascript type, or an array / object of further bindables
    //bind._notify - should be initialized to a new array
    bind.is_a_bindable = true;
    bind._fire = function(event, value) {
        for (var i = 0; i < this._notify.length; i++) {
            this._notify[i][event](value, this);
        }
    }
    bind.make = function(scope) { 
        var val = this.get();
        if (!$.isArray(val) && typeof(val) != typeof({})) {
            this.canvas = $('<span>');
            this.canvas.text(val);
        }
        return this; 
    }
    bind.is_component = true;
    bind.component_type = 'Bind';
    bind.children = [];
    bind.bind = function(instance) { this._notify.push(instance); }
    bind.sub = function(property) { 
        if (this._value[property]) { return this._value[property]; }
        else {throw new Error('could not find property ' + property); }
    }
    bind.get = function() { return unwrap(this); }
    bind.set = function(value) {  
        
        if (value == null) {
            this._value = null;
        } else if ($.isArray(value)) {
            this._value = [];
            for (var i = 0; i < value.length; i++) {
                this._value.push(wrap(value[i]));
            }
        } else if (typeof(value) == typeof({})) {
            this._value = {};
            for (var attr in value) {
                this._value[attr] = wrap(value[attr]);
            }
        } else { 
            if (this.canvas) {
                this.canvas.text(value);
            }
            this._value = value;
        }
        this._fire('set', value);
    }
    bind.add = function(value) {
        this._value.push(wrap(value));
        this._fire('add', value);
    }
    bind.remove = function(value, property) {
        this._value = $.grep(this._value, function(element){
            return property ? value[property] == unwrap(element)[property] : value == unwrap(element);
        }, true);
        this._fire('remove', value);
    }
    
    j.Bind = function(data) { return wrap(data); }
    
    //prototype for creating the Bindable/Component things returned by Ref
    var ref = {};
    ref.is_component = true;
    ref.is_a_bindable = true;
    ref.component_type = 'Ref';
    ref.children = [];
    ref.get = function() { throw new Error('Reference ' + ref.exp + ' has not yet been resolved!'); }
    ref.make = function(scope) {
        return j.lookup(scope, this.exp).make(scope);
    }
    
    j.Ref = function(exp) { 
        var r = j.inherit(ref);
        r.exp = exp;
        return r;
    }

    var cwrap = {};
    cwrap.is_component = true;
    cwrap.is_a_bindable = true;
    cwrap.component_type = 'Wrap';
    cwrap.children = [];
    cwrap.bind = function(instance) {
        this.bindable.bind(instance);
    }
    cwrap.make = function(scope) {
        var made = j.inherit(this);
        made.bindable = this.bindable.make(scope);
        var val = made.get();
        if (!$.isArray(val) && typeof(val) != typeof({})) {
            made.canvas = $('<span>');
            made.canvas.text(val);
        }
        return made;
    }
    cwrap.get = function() { return this.wrapper(this.bindable.get()); }
    
    //wraps the given Bindable in a function
    j.Wrap = function(wrapper, bindable) { 
        var w = j.inherit(cwrap);
        w.bindable = bindable;
        w.wrapper = wrapper;
        return w;
    }

    //
    // Components
    //

    //prototype for set instances
    var set_instance = {};
    set_instance.update = function(value, bindable) {
        this.canvas.empty();
        var list = bindable._value;
        for (var i = 0; i < list.length; i++) {
            var new_scope = j.inherit(this.scope);
            new_scope[this.to] = list[i];
            for (var k = 0; k < this.children.length; k++) {
                this.canvas.append(this.children[k].make(new_scope).canvas);
            }
        }
    }
    set_instance.set = set_instance.update;
    set_instance.add = set_instance.update;
    set_instance.remove = set_instance.update;

    j.Set = j.componentFromMaker('Set', function(scope, config, children) {
        var inst = j.inherit(set_instance);
        var bind = config.bind.make(scope);
        inst.scope = scope;
        inst.children = children;
        inst.to = config.to;
        inst.canvas = $('<div>').addClass('j_Set');
        bind.bind(inst);
        inst.update(null, bind);
        return inst;
    });
    
    j.Toggle = j.componentFromMaker('Toggle', function(scope, config, children) {
        var tag;
        if (config.span) {
            tag = '<span>';
        } else {
            tag = '<div>';
        }
        var inst = j.simpleInstance(tag, ['j_Toggle'], {}, {}, {}, j.childize(scope, children), scope, config);
        function set(val) {
            if (!config.flip) { config.flip = false; }
            if (Boolean(val) != Boolean(config.flip)) { 
                inst.canvas.show();
                if (config.span) {inst.canvas.css('display', 'inline');}
            } else {
                inst.canvas.hide();
            }
        }
        made = config.bind.make(scope);
        set(made.get());
        made.bind(inst);
        inst.set = set;
        return inst;
    });
    
    
    j.Call = function(func) {
        var args = $.makeArray(arguments).slice(1);
        return function(scope) {
            return func.apply(this, $.map(args, function(a_exp) { return unwrap(j.lookup(scope, a_exp)); }));
        }
    }
  
  
    j.PlainText = function(text) {
        var comp = {};
        comp.is_component = true;
        comp.children = [];
        comp.make = function(scope){
            var inst = {};
            inst.canvas = text;
            return inst;
        }
        comp.component_type = 'PlainText';
        return comp;
    }
    
    j.Raw = function(html) {
        var comp = {};
        comp.is_component = true;
        comp.children = [];
        comp.make = function(scope){
            var inst = {};
            inst.canvas = $(html);
            return inst;
        }
        comp.component_type = 'Raw';
        return comp;
    }
    
    ssHTML = function(tag, attrs) { 
        return j.componentFromMaker(tag, function(scope, config, children) {
            var attributes = {};
            if (attrs) {
                for (var i = 0; i < attrs.length; i++)
                {
                    var a = attrs[i];
                    if (config[a]) {
                        attributes[a] = config[a];
                    }
                }
            }
            return j.simpleInstance('<' + tag + '>', ['j_' + tag], attributes, {}, {}, j.childize(scope, children), scope, config);
        });
    }
    
    j.Span = ssHTML('Span');
    j.H1 = ssHTML('H1');
    j.H2 = ssHTML('H2');    
    j.H3 = ssHTML('H3');
    j.H4 = ssHTML('H4');
    j.H5 = ssHTML('H5');
    j.H6 = ssHTML('H6');    
    j.P = ssHTML('P');
    j.Div = ssHTML('Div');
    j.A = ssHTML('A', ['href', 'charset', 'coords', 'hreflang', 'name', 'rel', 'rev', 'shape', 'target']);
    j.Img = ssHTML('Img', ['alt', 'src']);
  
    j.Line = j.HTMLComponent('<div>', ['j_Line'], [], [], []);

  
    j.Button = j.componentFromMaker('Button', function(scope, config, children) {
        var onclick = function() { config.action(scope) };
        return j.simpleInstance('<a>', ['j_Button'], {href: 'javascript: void(0);'}, {}, {click: onclick}, j.childize(scope, children), scope, config);
    });

    j.Form = j.componentFromMaker('Form', function(scope, config, children) {
        var inst = j.simpleInstance('<form>', ['j_Form'], {}, {}, {}, j.childize(scope, children), scope, config);
        inst.canvas.validate({ submitHandler: function() {
            try {
                var form_data = {}
                var inputs = inst.canvas.find('input, textarea, select');
                inputs.each(function(index, element)
                {
                    var owner = $(element).data('j_owner');
                    if (owner && owner.get_value) {form_data[$(element).attr('name')] = owner.get_value(); }
                });
                config.action(form_data);
                if (config.clears) {
                    inst.canvas[0].reset();
                }
            } catch (e)
            {
                log(e);
            }
            return false;
        }});
        return inst;
    });
    
    //config.text determines what gets displayed
    j.Submit = j.componentFromMaker('Submit', function(scope, config, children) {
        return j.simpleInstance('<input>', ['j_Submit'], {type: 'submit', name: 'submit', value: config.text}, {}, {}, j.childize(scope, children), scope, config);
    });
    
    j.Input = j.componentFromMaker('Input', function(scope, config, children) {
        var tag;
        var nc = children.slice(0);
        if (config.type == 'textarea') {
            tag = 'textarea';
        } else if (config.type == 'dropdown') {
            tag = 'select';
            $.each(config.choices, function(index, choice) {
                nc.push(j.Choice({value: choice}, choice));
            });
        } else {
            tag = 'input';
        }
        var inst = j.simpleInstance('<' + tag + '>', ['j_Input'], {name: config.name}, {}, {}, j.childize(scope, nc), scope, config);
        inst.get_value = function()  { 
            return inst.canvas.val();  //this is where I'll put conversion code (ie, turn numbers from strings to numbers)
        } 
        return inst;
    });

    j.Choice = j.componentFromMaker('Choice', function(scope, config, children) {
        return j.simpleInstance('<option>', ['j_Option'], {value: config.value}, {}, {}, j.childize(scope, children), scope, config);
    }); 

    j.Layout = j.componentFromMaker('Layout', function(scope, config, children) {
        var styles = {};
        if (config.width) 
        { 
            styles.width = config.width;
            if (config.chunks) 
            {
                scope = j.inherit(scope);
                scope['j_Layout'] = {};
                var l = scope['j_Layout'];
                if (!config.gap) {config.gap = 0 }
                l.chunk_size = (config.width - 
                    (config.gap * (config.chunks - 1))) / config.chunks;
                l.gap = config.gap;
                l.first = true;
            }
        }
    
        return j.simpleInstance('<div>', ['j_Layout'], {}, styles, {}, j.childize(scope, children), scope, config);
    }); 
    
    
    j.Column = j.componentFromMaker('Column', function(scope, config, children) {
        var l = scope['j_Layout'];
        var styles = {}
        if (l) {
            if (l.first || config.no_left) {
                config.no_left = true;
                l.first = false;
                styles['margin-left'] = 0;
            } else {
                styles['margin-left'] = l.gap;
            }
            styles.width = l.chunk_size * config.span + l.gap * (config.span - 1);
            styles.float = 'left';
        }
        return j.simpleInstance('<div>', ['j_Column'], {}, styles, {}, j.childize(scope, children), scope, config);
    }); 
    
    j.Root = function(root_element)
    {
        $(document).ready(function()
        {
            $(document.body).append(root_element.make({}).canvas);
        });
    }
       
    return j;
}();