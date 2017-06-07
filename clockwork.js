//ClockworkCore engine
var Clockwork = (function () {
    /*This object stores the public functions*/
    var clockwork = this;
    //The list of components loaded
    var components = {};
    //The array of objects in the current level
    var objects = [];
    //The engine global variables
    var globalvars = {};

    var parsedLevels = [];
    var currentLevel = 0;

    var fps = 0;
    var started = false;

    //The number of pending assets to load
    var loading = 0;

    //The animation engine used
    var animationEngine;

    //Is the game code trying to exit the current level?
    var exitFlag = false;

    //Holds the setInterval return value
    var intervalholder;

    var collisions = {};
    collisions.shapes = [];
    collisions.detect = {};

    var collisionCache = [];

    function isEmptyCollision(x) {
        if (x.hasNoCollisions === true) {
            return true;
        } else if (x.hasNoCollisions === false) {
            return false;
        } else {
            for (var k in x) {
                x.hasNoCollisions = false;
                return false;
            }
            x.hasNoCollisions = true;
            return true;
        }
    }

    //The algorithm used to when detecting the collisions
    var moved = [];
    var collisionAlgorithm = function (objects, calculate) {
        for (var i = 0; i < objects.length; i++) {
            var firstObject = objects[i];
            if (firstObject !== undefined && !isEmptyCollision(firstObject)) {
                moved[i] = firstObject.vars["#moveflag"];
                firstObject.vars["#moveflag"] = false;
                if (collisionCache[i] === undefined) {
                    collisionCache[i] = [];
                }
                var thisCache = collisionCache[i];
                for (var j = 0; j < objects.length; j++) {
                    var secondObject = objects[j];
                    if (i !== j && objects[j] !== undefined && !isEmptyCollision(objects[j]) && objects[i] !== undefined) {
                        if (!(moved[i] == false && (moved[j] || secondObject.vars["#moveflag"]) == false)) {
                            thisCache[j] = calculate(firstObject, secondObject);
                        } else {
                            var cache = thisCache[j];
                            for (var k = 0; k < cache.length; k++) {
                                firstObject.execute_event("#collide", cache[k].a);
                                secondObject.execute_event("#collide", cache[k].b);
                            }
                        }
                    }
                }
            }
        }

    };

    //A reference to the loader
    clockwork.loader;

    this.setLoader = function (loader) {
        clockwork.loader = loader;
    }



    //...................................
    //   Engine control
    //...................................


    this.start = function (newfps, DOMelement) {
        fps = newfps;
        started = true;
        this.setEngineVar("#DOM", DOMelement);
        clockwork.loadLevelByIndex(currentLevel);
    };

    this.fps = function () {
        clockwork.debug.log("fps is deprecated, use getFPS instead.");
        return fps;
    }

    this.getFPS = function () {
        return fps;
    }

    this.setup = function () {
        objects.map(function (x) { return x }).asyncForEach(function (x, cb) { //Create a copy of the objects list, so that objects spawned during #setup wont be initialized twice
            var lock = loadQueue(cb);//When everything is unlocked, execute the callback and iterate to the next
            lock.loader = clockwork.loader;
            x.execute_event("#setup", lock);
            lock.check();//In case the event ignores the lock
        }, function () {//When eveything is loaded, start the main loop and hide the loader
            intervalholder = setInterval(loop, Math.round(1000 / fps));
            if (clockwork.loader) {
                clockwork.loader.hide();
            }
        });
    };

    //Useful when you need to perform async operations on each of the elements of an array, but in strict order, and execute a callback at the end
    Object.defineProperty(Array.prototype, 'asyncForEach', {
        enumerable: false,
        value: function (action, cb, index) {
            var i = index || 0;
            if (i >= this.length) {
                return cb();
            }
            var that = this;
            return action(this[i], function () { that.asyncForEach(action, cb, i + 1); });
        }
    });

    this.pause = function () {
        clearInterval(intervalholder);
    };

    this.getEngineVar = function (variable) {
        return globalvars[variable];
    };

    this.setEngineVar = function (variable, value) {
        var cameraMovedFlag = false;
        if (variable == "$cameraX") {
            objects.filter(function (x) {
                return x && x.isstatic;
            }).forEach(function (object) {
                for (var shape in object.collision) {
                    var shapesBody = object.collision[shape];
                    for (var k = 0; k < shapesBody.length; k++) {
                        shapesBody[k].x += value - (globalvars[variable] || 0);
                    }
                }
            });
            cameraMovedFlag = true;
        }
        if (variable == "$cameraY") {
            objects.filter(function (x) {
                return x && x.isstatic;
            }).forEach(function (object) {
                for (var shape in object.collision) {
                    var shapesBody = object.collision[shape];
                    for (var k = 0; k < shapesBody.length; k++) {
                        shapesBody[k].y += value - (globalvars[variable] || 0);
                    }
                }
            });
            cameraMovedFlag = true;

        }
        if (variable == "$cameraZ") {
            objects.filter(function (x) {
                return x && x.isstatic;
            }).forEach(function (object) {
                for (var shape in object.collision) {
                    var shapesBody = object.collision[shape];
                    for (var k = 0; k < shapesBody.length; k++) {
                        shapesBody[k].z += value - (globalvars[variable] || 0);
                    }
                }
            });
            cameraMovedFlag = true;

        }
        globalvars[variable] = value;
        if (cameraMovedFlag === true) {
            animationEngine.setCamera(globalvars["$cameraX"], globalvars["$cameraY"], globalvars["$cameraZ"]);
        }
    };

    this.getObject = function (variable) {
        return objects[variable];
    };

    this.find = function (variable) {
        return searchWhereDeep(objects, ["vars", "#name"], variable);
    };

    this.setAnimationEngine = function (engine) {
        animationEngine = engine;
    };

    this.getAnimationEngine = function () {
        clockwork.debug.log("getAnimationEngine is deprecated, use getRenderingLibrary instead.");
        return animationEngine;
    };

    this.getRenderingLibrary = function () {
        return animationEngine;
    };

    //....................
    //     JS Tools
    //....................

    function inheritObject(o) {
        var F = function () { };
        F.prototype = o;
        var nuevo = new F();
        for (var name in o) {
            if (typeof o[name] == 'object' && name != "engine") {
                nuevo[name] = inheritObject(o[name]);
            }
        }
        return nuevo;
    }

    Function.prototype.method = function (name, func) {
        this.prototype[name] = func;
        return this;
    };

    Function.method('curry', function () {
        var slice = Array.prototype.slice, args = slice.apply(arguments), that = this;
        return function () {
            return that.apply(null, args.concat(slice.apply(arguments)));
        };
    });

    Function.method('curryThis', function () {
        var slice = Array.prototype.slice, args = slice.apply(arguments), that = this;
        var caller = args.splice(0, 1)[0];
        return function () {
            return that.apply(caller, args.concat(slice.apply(arguments)));
        };
    });

    function searchWhere(array, key, value) {
        for (var i = 0; i < array.length; i++) {
            if (array[i][key] == value) {
                return array[i];
            }
        }
        return null;
    }

    function searchWhereDeep(array, keys, value) {
        for (var i = 0; i < array.length; i++) {
            var object = array[i];
            for (var j = 0; j < keys.length; j++) {
                if (typeof object == "undefined") {
                    continue;
                }
                object = object[keys[j]];
            }
            if (object == value) {
                return array[i];
            }
        }
        return null;
    }

    function deleteWhere(array, key, value) {
        for (var i = 0; i < array.length; i++) {
            if (array[i][key] == value) {
                array.splice(i, 1);
                i--;
            }
        }
        return null;
    }

    function addJSONparameters(object, string) {
        var temp = JSON.parse(string);
        for (var attrname in temp) {
            object[attrname] = temp[attrname];
        }
    }

    function getXMLHttpRequest() {
        if (window.XMLHttpRequest && !(window.ActiveXObject && isFileProtocol)) {
            return new (XMLHttpRequest);
        } else {
            try {
                return new (ActiveXObject)("MSXML2.XMLHTTP.3.0");
            } catch (e) {
                return null;
            }
        }
    }

    function loadXMLFile(url, parser, callback) {

        var xmlhttp = getXMLHttpRequest();

        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                parser(xmlhttp.responseXML);
                callback();
            }
        };
        xmlhttp.open("GET", url, true);
        xmlhttp.send();

    }

    function cloneObject(o) {
        return JSON.parse(JSON.stringify(o));
    }


    //...................
    //      Components
    //...................


    function createComponent(name) {
        components[name] = {
            eventfunction: {},
            vars: {},
            name: name,
            engine: clockwork,
            collision: {},
            setVar: function (variable, value) {
                if (deferringActionsBecausePaused) {
                    return pushActionQueue((function () { return this.setVar(variable, value); }).bind(this));
                }
                if (this.vars[variable] === value) {
                    return;
                }
                switch (variable) {
                    case "$x":
                        this.vars["#moveflag"] = true;
                        if (this.spriteholder != undefined) {
                            animationEngine.setX(this.spriteholder, value);
                        }
                        for (var shape in this.collision) {
                            var shapesBody = this.collision[shape];
                            for (var k = 0; k < shapesBody.length; k++) {
                                shapesBody[k].x += value - (this.vars["$x"] || 0);
                            }
                        }
                        break;
                    case "$y":
                        this.vars["#moveflag"] = true;
                        if (this.spriteholder != undefined) {
                            animationEngine.setY(this.spriteholder, value);
                        }
                        for (var shape in this.collision) {
                            var shapesBody = this.collision[shape];
                            for (var k = 0; k < shapesBody.length; k++) {
                                shapesBody[k].y += value - (this.vars["$y"] || 0);
                            }
                        }
                        break;
                    case "$z":
                        this.vars["#moveflag"] = true;
                        if (this.spriteholder != undefined) {
                            animationEngine.setZ(this.spriteholder, value);
                        }
                        for (var shape in this.collision) {
                            var shapesBody = this.collision[shape];
                            for (var k = 0; k < shapesBody.length; k++) {
                                shapesBody[k].z += value - (this.vars["$z"] || 0);
                            }
                        }
                        break;
                    case "$state":
                        if (this.spriteholder != undefined) {
                            animationEngine.setState(this.spriteholder, value);
                        }
                        break;
                    default:
                        if (variable[0] == "$" && this.spriteholder != undefined) {
                            animationEngine.setParameter(this.spriteholder, variable, value);
                        }
                        break;
                }
                this.vars[variable] = value;
                this.execute_event("#setVar", { key: variable, value: value })
            },
            getVar: function (variable) {
                return this.vars[variable];
            },
            setCollider: function (tag, value) {
                if (deferringActionsBecausePaused) {
                    return pushActionQueue((function () { return this.setCollider(tag, value); }).bind(this));
                }
                for (var shape in this.collision) {
                    var shapesBody = this.collision[shape];
                    for (k = 0; k < shapesBody.length; k++) {
                        if (shapesBody[k]["#tag"] == tag) {
                            shapesBody[k] = value;
                            shapesBody[k].x += this.vars["$x"];
                            shapesBody[k].y += this.vars["$y"];
                            shapesBody[k].z += this.vars["$z"];
                            shapesBody[k]["#tag"] = tag;
                            this.collisionChanged();
                        }
                    }
                }
            },
            execute_event: function (name, args) {
                if (debugMode == true) {
                    if (name === "#setup") {
                        this.hasBeenSetUp = true;
                    }
                    if (deferringActionsBecausePaused) {
                        return pushActionQueue((function () { return this.execute_event(name, args); }).bind(this));
                    }
                    eventStack.push({ component: this.vars["#name"], event: name, object: this });
                    for (var bp of breakpoints) {
                        if (eventLoopPaused != true && name == bp.event && this.instanceOf(bp.component)) {
                            clockwork.debug.pause();
                            hitBreakpoint(bp, this);
                            eventTreeSnapshot = { position: "EventStart", object: this, event: name, args: args, deferredActions: [], stackFrame: eventStack[eventStack.length - 1] };
                            for (var i = eventStack.length - 2; i >= 0; i--) {
                                eventTreeSnapshot = { child: eventTreeSnapshot, deferredActions: [], event: eventStack[i].event, object: eventStack[i].object, stackFrame: eventStack[i] };
                            }
                            break;
                        }
                    }
                    if (this.eventfunction[name] != undefined) {
                        if (name[0] !== "#" && this.hasBeenSetUp !== true) {
                            clockwork.debug.log("Warning: Event " + name + " of " + this.vars["#name"] + " has been called before #setup has been executed");
                        }
                        try {
                            this.eventfunction[name].call(this, args);
                        } catch (e) {
                            var lineNumber = /eval code:([0-9]*)/.exec(e.stack)[1];
                            breakpointHandler("error", { msg: "The folllowing exception happened at line " + lineNumber + " event handler '" + name + "' of '" + this.vars["#name"] + "': " + e.message });
                        }
                    }
                    eventStack.pop();
                } else {
                    if (this.eventfunction[name] != undefined) {
                        this.eventfunction[name].call(this, args);
                    }
                }
            },
            instanceOf: function (name) {
                if (this.name == name) {
                    return true;
                }
                if (this.prototypes != undefined) {
                    for (var i = 0; i < this.prototypes.length; i++) {
                        if (this.prototypes[i].name == name) {
                            return true;
                        }
                        if (this.prototypes[i].instanceOf != undefined) {
                            if (this.prototypes[i].instanceOf(name) == true) {
                                return true;
                            }
                        }

                    }
                }
                if (this.prototype != undefined && this.prototype.instanceOf != undefined) {
                    return this.prototype.instanceOf(name);
                }
                return false;
            },
            //Mark as dirty
            collisionChanged: function (name) {
                this.vars["#moveflag"] = true;
            },
            getVarKeys: function () {
                var keys = [];
                for (var k in this.vars) {
                    keys.push(k);
                }
                return keys;
            }
        };
    }

    function inheritComponent(name, parent) {
        components[name] = inheritObject(components[parent]);
        components[name].name = name;
        components[name].parent = parent;
        components[name].prototypes = [components[parent]];
        components[name].vars = inheritObject(components[parent].vars);
        components[name].eventfunction = inheritObject(components[parent].eventfunction);
        components[name].collision = inheritObject(components[parent].collision);
    }

    function inheritMultipleComponents(name, parents) {
        var parentsComponents = parents.map(function (x) { return components[x]; });
        createComponent(name);
        components[name].parents = parentsComponents;
        components[name].prototypes = parentsComponents;
        for (var i = 0; i < parentsComponents.length; i++) {
            if (parentsComponents[i].sprite) {
                components[name].sprite = parentsComponents[i].sprite;
            }
        }
        components[name].vars = parentsComponents.reduce(function (previousValue, currentValue, index, array) {
            for (var attrname in currentValue.vars) { previousValue[attrname] = currentValue.vars[attrname]; }
            return previousValue;
        }, {});
        components[name].collision = parentsComponents.reduce(function (previousValue, currentValue, index, array) {
            for (var attrname in currentValue.collision) {
                previousValue[attrname] = previousValue[attrname] || [];
                previousValue[attrname] = previousValue[attrname].concat(currentValue.collision[attrname]);
            }
            return previousValue;
        }, {});
        components[name].eventfunctionArray = parentsComponents.reduce(function (previousValue, currentValue, index, array) {
            for (var attrname in currentValue.eventfunction) {
                previousValue[attrname] = previousValue[attrname] || [];
                previousValue[attrname].push(currentValue.eventfunction[attrname]);
            }
            return previousValue;
        }, {});
        for (key in components[name].eventfunctionArray) {
            var functionArray = components[name].eventfunctionArray[key];
            components[name].eventfunction[key] = (function (functionArray) {
                return function (args) {
                    for (var i = 0; i < functionArray.length; i++) {
                        functionArray[i].call(this, args);
                    };
                };
            })(functionArray);
        }
    }



    function addComponentHandler(name, event, somefunction, override) {
        if (override == false) {
            var oldHandler = components[name].eventfunction[event];
            components[name].eventfunction[event] = function (args) {
                oldHandler.call(this, args);
                somefunction.call(this, args);
            };
        } else {
            components[name].eventfunction[event] = somefunction;
        }
    }


    function addComponentVar(name, variable, value) {
        components[name].vars[variable] = value;
    };

    function setComponentSprite(name, sprite) {
        components[name].sprite = sprite;
    };

    function addComponentCollision(name, type, object) {
        components[name].collision[type].push(object);
    };

    function implementComponent(name, type) {
        if (debugMode && !components[type]) {
            breakpointHandler("error", { msg: "You tried to create an instance of the component " + type + ", which has not been registered." });
            return;
        }
        var newone = inheritObject(components[type]);
        newone.vars["#name"] = name;
        newone.spriteholder = undefined;
        addSyntacticSugar(newone);
        return newone;
    };

    function implementMultipleComponents(name, types) {
        inheritMultipleComponents("@dynamic_" + name, types);
        var newone = inheritObject(components["@dynamic_" + name]);
        newone.vars["#name"] = name;
        newone.spriteholder = undefined;
        addSyntacticSugar(newone);
        return newone;
    };

    function addSyntacticSugar(object) {
        object.do = new Proxy(object, {
            get: function (target, name) {
                return function (event) {
                    return target.execute_event(name, event)
                };
            }
        });
        if (object.setVar) { //Regular objects
            object.var = new Proxy(object, {
                get: function (target, name) {
                    return target.getVar(name);
                },
                set: function (target, name, value) {
                    return target.setVar(name, value);
                },
                ownKeys: function (target) {
                    return Object.getOwnPropertyNames(target.vars);
                }
            });
        } else if (object.setEngineVar) { //The engine itself
            object.var = new Proxy(object, {
                get: function (target, name) {
                    return target.getEngineVar(name);
                },
                set: function (target, name, value) {
                    return target.setEngineVar(name, value);
                },
                enumerate: function (target) {
                    return Object.keys(target).filter(function (key) { return key.indexOf("_#") != 0; })[Symbol.iterator]()
                }
            });
        }
    }
    addSyntacticSugar(clockwork);

    this.loadComponents = function (newcomponents) {
        for (var i = 0; i < newcomponents.length; i++) {
            var thiscomponent = newcomponents[i];

            if (thiscomponent.inherits != undefined) {
                if (thiscomponent.inherits instanceof Array) {
                    inheritMultipleComponents(thiscomponent.name, thiscomponent.inherits);
                } else {
                    inheritComponent(thiscomponent.name, thiscomponent.inherits);
                }
            } else {
                createComponent(thiscomponent.name);
            }
            if (thiscomponent.sprite != undefined) {
                setComponentSprite(thiscomponent.name, thiscomponent.sprite);
            }


            if (typeof thiscomponent.vars != "undefined") {
                for (var j = 0; j < thiscomponent.vars.length; j++) {
                    addComponentVar(thiscomponent.name, thiscomponent.vars[j].name, thiscomponent.vars[j].value);
                }
            }

            if (typeof thiscomponent.collision != "undefined") {
                for (var j = 0; j < collisions.shapes.length; j++) {
                    var thistype = thiscomponent.collision[collisions.shapes[j]];
                    if (thistype != undefined) {
                        components[thiscomponent.name].collision[collisions.shapes[j]] = [];
                        for (var k = 0; k < thistype.length; k++) {
                            addComponentCollision(thiscomponent.name, collisions.shapes[j], thistype[k]);
                        }
                    }
                }
            }


            if (typeof thiscomponent.events != "undefined") {
                for (var j = 0; j < thiscomponent.events.length; j++) {
                    addComponentHandler(thiscomponent.name, thiscomponent.events[j].name, thiscomponent.events[j].code, thiscomponent.events[j].override === false ? false : true);
                }
            }
        }
    };

    //...................
    //      Levels
    //...................

    this.addObjectLive = function (name, kind, x, y, z, isStatic, timeTravels, vars) {
        clockwork.debug.log("addObjectLive is deprecated, use spawn instead.");
        var object = implementComponent(name, kind);
        object.setVar("$x", x || 0);
        object.setVar("$y", y || 0);
        object.setVar("$z", z || 0);
        object.type = kind;
        object.isstatic = !(isStatic);
        if (object.sprite != undefined) {
            object.spriteholder = animationEngine.addObject(object.sprite, object.getVar("$state"), x || 0, y || 0, z || 0, isStatic || false, timeTravels || false);
            for (var key in object.vars) {
                if (key[0] == "$") { //Update renderable properties
                    object.setVar(key, object.getVar(key));
                }
            }
        }
        for (var name in vars) {
            object.setVar(name, vars[name]);
        }
        object.execute_event("#setup");
        object.handler = objects.length;
        objects.push(object);
        return object;
    }

    this.spawn = function (name, kind, vars, isStatic) {
        var object = implementComponent(name, kind);
        object.setVar("$x", vars.$x || 0);
        object.setVar("$y", vars.$x || 0);
        object.setVar("$z", vars.$x || 0);
        object.type = kind;
        object.isstatic = isStatic === true;
        if (object.sprite != undefined) {
            object.spriteholder = animationEngine.addObject(object.sprite, object.getVar("$state"), x || 0, y || 0, z || 0, isStatic || false, timeTravels || false);
            for (var key in object.vars) {
                if (key[0] == "$") { //Update renderable properties
                    object.setVar(key, object.getVar(key));
                }
            }
        }
        for (var name in vars) {
            object.setVar(name, vars[name]);
        }
        object.execute_event("#setup");
        object.handler = objects.length;
        objects.push(object);
        return object;
    }




    this.deleteObjectLive = function (object) {
        clockwork.debug.log("deleteObjectLive is deprecated, use getFPS instead.");
        object.execute_event("#exit", []);
        animationEngine.deleteObject(object.spriteholder);
        for (var i = 0; i < objects.length; i++) {
            if (objects[i] == object) {
                objects[i] = undefined;
            }
        }
    }

    this.destroy = function (object) {
        object.execute_event("#exit", []);
        animationEngine.deleteObject(object.spriteholder);
        for (var i = 0; i < objects.length; i++) {
            if (objects[i] == object) {
                objects[i] = undefined;
            }
        }
    }

    this.listObjects = function () {
        return objects.filter(function (x) { return x; });
    }

    this.loadLevelByIndex = function (n) {
        currentLevel = n;
        if (started != true) {
            return;
        }
        for (var j = 0; j < objects.length; j++) {
            if (objects[j] != null) {
                objects[j].execute_event("#exit", []);
            }
        }
        clockwork.setEngineVar("#currentLevel", n);
        clockwork.pause();
        if (clockwork.loader) {
            clockwork.loader.show();
        }
        exitFlag = true;
        setTimeout(function () {
            deleteSprites();
            animationEngine.clear();//Just in case
            objects = loadLevelObjects(parsedLevels[n]);
            assignSprites();
            exitFlag = false;
            clockwork.setup();
        }, 5);
    };

    this.loadLevelByID = function (id) {
        clockwork.debug.log("loadLevelByID is deprecated, use loadLevel instead.");
        for (var i = 0; i < parsedLevels.length; i++) {
            if (id == parsedLevels[i].id) {
                clockwork.loadLevelByIndex(i);
                return;
            }
        }
    };

    this.loadLevel = function (id) {
        for (var i = 0; i < parsedLevels.length; i++) {
            if (id == parsedLevels[i].id) {
                clockwork.loadLevelByIndex(i);
                return;
            }
        }
    };

    this.reloadLevel = function (id) {
        clockwork.loadLevelByIndex(currentLevel);
    };

    this.loadLevelsFromXML = function (url, callback) {
        loadXMLFile(url, function (xmlDoc) {
            for (var i = 0; i < xmlDoc.getElementsByTagName("level").length; i++) {
                parsedLevels.push(XMLlevelToJson(xmlDoc.getElementsByTagName("level")[i]));
            }
        }, callback);
    };

    this.loadLevelsFromXMLString = function (data, callback, names) {
        var xmlDoc = (new DOMParser()).parseFromString(data, "text/xml");
        names = names || [];
        for (var i = 0; i < xmlDoc.getElementsByTagName("level").length; i++) {
            parsedLevels.push(XMLlevelToJson(xmlDoc.getElementsByTagName("level")[i]));
        }
        callback();
    };

    this.loadLevelsFromJSONobject = function (data, callback) {
        parsedLevels = parsedLevels.concat(data);
        if (callback) {
            { callback(); }
        };
    }

    function XMLlevelToJson(thislevel) {
        var level = {};
        level.id = thislevel.getAttributeNode("id").value;
        level.objects = [];
        for (var j = 0; j < thislevel.getElementsByTagName("object").length; j++) {
            var thisobject = thislevel.getElementsByTagName("object")[j];
            var object = {};
            //Set name
            object.name = thisobject.getAttributeNode("name").value;
            //Set type
            if (thisobject.getElementsByTagName("type").length > 0) {
                //Composition
                var names = [];
                for (var k = 0; k < thisobject.getElementsByTagName("type").length; k++) {
                    names.push(thisobject.getElementsByTagName("type")[k].getAttributeNode("id").value);
                }
                object.type = names;
            } else {
                //Inheritance
                object.type = thisobject.getAttributeNode("type").value;
            }
            //Set spritesheet
            object.sprite = thisobject.getAttributeNode("spritesheet") ? thisobject.getAttributeNode("spritesheet").value : null;
            //Set whether the object is static
            object.isstatic = thisobject.getAttributeNode("static") != null;
            //Set x,y,z
            object.x = +thisobject.getAttributeNode("x").value;
            object.y = +thisobject.getAttributeNode("y").value;
            object.z = thisobject.getAttributeNode("z") ? (+thisobject.getAttributeNode("z").value) : null;
            //Set vars
            if (thisobject.getAttributeNode("vars")) {
                object.vars = thisobject.getAttributeNode("vars").value;
            } else {
                object.vars = "{}";
            }
            level.objects.push(object);
        }
        return level;
    }

    function loadLevelObjects(thislevel) {
        return thislevel.objects.map(function (o, i) {
            var object;
            if (o.type instanceof Array) {
                object = implementMultipleComponents(o.name, o.type);
            } else {
                object = implementComponent(o.name, o.type);
            }
            if (object == null) {
                return null;
            }
            object.type = o.type;
            if (o.sprite != null) {
                object.sprite = o.sprite;
            }
            if (o.isstatic != null && o.isstatic != "false") {
                object.isstatic = true;
            }
            object.setVar("$x", o.x);
            object.setVar("$y", o.y);
            if (o.z != undefined) {
                object.setVar("$z", o.z);
            } else {
                object.setVar("$z", 0);
            }
            for (var attrname in o.vars) {
                object.setVar(attrname, o.vars[attrname]);
            }
            object.handler = i;
            return object;
        }).filter(function (x) { return x != null; });
    }

    var loadQueue = function (callback) {
        var value = 0;
        var used = 0;
        return {
            release: function () {
                value--;
                if (value == 0) {  //If it is not locked
                    callback();
                }
            },
            lock: function (cb) {
                value++;
                used = 1;
            },
            check: function () {  //In case lock has not been called
                if (used == 0) {
                    callback();
                }
            },
        };
    }



    //...................
    //     Sprites
    //...................

    function assignSprites() {
        animationEngine.setCamera(0, 0);
        for (var i = 0; i < objects.length; i++) {
            if (objects[i].sprite != undefined) {
                if (objects[i].sprite != undefined) {
                    objects[i].spriteholder = animationEngine.addObject(objects[i].sprite, undefined, objects[i].vars["$x"], objects[i].vars["$y"], objects[i].vars["$z"], objects[i].isstatic, objects[i].doesnottimetravel);
                    for (var key in objects[i].vars) {
                        if (key[0] == "$") { //Update renderable properties
                            objects[i].setVar(key, objects[i].getVar(key));
                        }
                    }
                }
            }
        }
    }

    function deleteSprites() {
        for (var i = 0; i < objects.length; i++) {
            if (objects[i] != undefined && objects[i].spriteholder != -1) {
                animationEngine.deleteObject(objects[i].spriteholder);
            }
        }
    };

    //......................
    //    Main loop and events
    //......................

    function loop() {

        if (animationEngine.tick != undefined) {
            animationEngine.tick(1000 / fps);
        }

        if (eventLoopPaused) {
            return;
        }

        processCollisions();
        if (exitFlag) {
            return;
        }

        clockwork.execute_event("#loop");
        if (exitFlag) {
            return;
        }

    }

    this.execute_event = function (name, e_args) {
        var r, result = [];
        if (debugMode == true) {
            for (var i = 0; i < objects.length; i++) {
                var body = objects[i];
                if (typeof body !== "undefined") {
                    body.execute_event("#", { "name": name, "args": e_args });
                    body.execute_event(name, e_args);
                    if (eventLoopPaused) {
                        eventTreeSnapshot.nextIndex = i + 1;
                        break;
                    }
                }
            }
        } else {
            objects.forEach(function (body) {
                if (typeof body !== "undefined") {
                    body.execute_event("#", { "name": name, "args": e_args });
                    body.execute_event(name, e_args);
                }
            });
        }
    };



    this.exitingLevel = function () {
        return exitFlag === true;
    }

    //..........................
    //     Colisions
    //...........................


    function registerShape(shapename) {
        if (collisions.shapes.indexOf(shapename) == -1) {
            collisions.shapes.push(shapename);
        }
    }

    function registerCollisionDetector(shape1, shape2, detector) {
        if (collisions.detect[shape1] == undefined) {
            collisions.detect[shape1] = {};
        }
        collisions.detect[shape1][shape2] = detector;
    }

    this.registerCollision = function (collisionPackage) {
        registerShape(collisionPackage.shape1);
        registerShape(collisionPackage.shape2);
        registerCollisionDetector(collisionPackage.shape1, collisionPackage.shape2, collisionPackage.detector);
    };

    function processCollisions() {
        return collisionAlgorithm(objects, checkCollision);
    }

    this.setCollisionAlgorithm = function (algorithm) {
        return collisionAlgorithm = algorithm;
    };

    this.collisionQuery = function (type, collider, queryObjects) {
        var collisionData = {};
        var result = [];
        var shape2 = type;
        var queriedObjects = queryObjects || objects;
        for (var i = 0; i < queriedObjects.length; i++) {
            b1 = queriedObjects[i];
            if (b1 != undefined) {
                //For each kind of shape
                for (var shape1 in b1.collision) {
                    shapesBody1 = b1.collision[shape1];
                    //For each shape of that kind
                    for (var k = 0; k < shapesBody1.length; k++) {
                        bodyShape1 = shapesBody1[k];
                        //Check if they collide
                        if (collisions.detect[shape1] != undefined && collisions.detect[shape1][shape2] != undefined && collisions.detect[shape1][shape2](bodyShape1, collider, collisionData) == true) {
                            result.push(b1);
                        }
                    }
                }
            }
        }
        return result;
    };

    //Outside for optimization purposes
    var emptyCache = [];
    var cache;
    var x1;
    var y1;
    var z1;
    var x2;
    var y2;
    var z2;
    var shapesBody1;
    var shapesBody2;
    var bodyShape1;
    var bodyShape2;
    var collisionData = {};
    var shape1, shape2, k, l;
    function checkCollision(b1, b2) {
        cache = emptyCache;
        //For each kind of shape
        for (shape1 in b1.collision) {
            for (shape2 in b2.collision) {
                shapesBody1 = b1.collision[shape1];
                shapesBody2 = b2.collision[shape2];
                //For each shape of that kind
                for (k = 0; k < shapesBody1.length; k++) {
                    for (l = 0; l < shapesBody2.length; l++) {
                        bodyShape1 = shapesBody1[k];
                        bodyShape2 = shapesBody2[l];
                        //Check if they collide
                        if (collisions.detect[shape1] != undefined && collisions.detect[shape1][shape2] != undefined && collisions.detect[shape1][shape2](bodyShape1, bodyShape2, collisionData) == true) {
                            //Send the info to the #collide event handlers
                            var a = { object: b2, shape1kind: shape1, shape2kind: shape2, shape1id: k, shape2id: l, data: collisionData, shape1tag: bodyShape1["#tag"], shape2tag: bodyShape2["#tag"] };
                            b1.execute_event("#collide", a);
                            var b = { object: b1, shape1kind: shape2, shape2kind: shape1, shape1id: l, shape2id: k, data: collisionData, shape1tag: bodyShape2["#tag"], shape2tag: bodyShape1["#tag"] };
                            collisionData = {};
                            b2.execute_event("#collide", b);
                            if (cache.length == 0) {
                                cache = [];
                                cache.push({ a: a, b: b });
                            }
                        }
                    }
                }
                if (!b2) {
                    break;
                }
                if (!b1) {
                    return;
                }
            }
        }
        return cache;
    }


    /////// DEBUG FUNCTIONALITY

    var debugMode = false;
    var breakpointHandler;
    var deferringActionsBecausePaused = false;
    var eventLoopPaused = false;
    var breakpoints = [];

    var eventTreeSnapshot = null;
    var eventStack = [];

    var actionQueue = [];

    var stopAtNextEvent = false;

    this.setBreakpoints = function (bp) {
        debugMode = true;
        breakpoints = bp;
    };
    this.setBreakpointHandler = function (handler) {
        debugMode = true;
        breakpointHandler = handler;
    };
    function hitBreakpoint(bp, object) {
        //The object references in the event stack is erased so Socket.io wont try to serialize it (it breaks because of the do proxy)
        breakpointHandler("breakpointHit", {
            bp: bp, stack: eventStack.map(function (x) { return { component: x.component, event: x.event }; }), vars: object.vars, globalvars: clockwork.var
        });
    }

    this.debug = {};

    this.debug.pause = function debugPause() {
        deferringActionsBecausePaused = true;
        eventLoopPaused = true;
    }

    this.debug.continue = function () {
        deferringActionsBecausePaused = false;
        continueEventTree(eventTreeSnapshot);
        eventTreeSnapshot = null;
        eventLoopPaused = false;
        breakpointHandler("continue");
    }

    this.debug.stepOver = function () {
        stepOverEventTree(eventTreeSnapshot);
    }

    this.debug.stepIn = function () {

    }

    this.debug.stepOut = function () {

    }

    this.debug.eval = function (expression) {
        var previousState = deferringActionsBecausePaused;
        deferringActionsBecausePaused = false;
        try {
            return JSON.stringify((new Function("return " + expression)).bind(getCurrentPausedObject())());
        } catch (e) {
            return e.message;
        } finally {
            deferringActionsBecausePaused = previousState;
        }
    }

    this.debug.log = function (x) {
        if (breakpointHandler) {
            breakpointHandler("log", x);
        }
    }

    function getCurrentPausedObject() {
        var currentNode = eventTreeSnapshot;
        while (currentNode.child) {
            currentNode = currentNode.child;
        }
        return currentNode.object;
    }

    function continueEventTree(node) {
        if (node.child) {
            continueEventTree(node.child);
            node.child = null;
            flushActionQueue();
        } else {
            node.object.execute_event(node.event, node.args);
        }
        if (typeof node.nextIndex !== "undefined") {
            for (var i = node.nextIndex; i < objects.length; i++) {
                if (objects[i]) {
                    objects[i].execute_event(node.event, node.args);
                }
            }
        }
    }

    function stepOverEventTree(node) {
        if (node.child) {
            stepOverEventTree(node.child);
        } else {
            if (node.nextIndex < objects.length) {
                if (objects[nextIndex]) {
                    objects[nextIndex].execute_event(node.event, node.args);
                    //TODO: keep working on step over
                    //breakpointHandler("step",);
                }
                node.nextIndex++;
            }
        }
    }

    function pushActionQueue(action) {
        var currentNode = eventTreeSnapshot;
        while (currentNode.stackFrame != eventStack[eventStack.length - 1]) { //Search the node corresponding to the stack frame being executed
            currentNode = currentNode.child;
        }
        currentNode.deferredActions.push(action);
    }

    function flushActionQueue() {
        var currentNode = eventTreeSnapshot;
        while (currentNode.child) {
            currentNode = currentNode.child;
        }
        currentNode.deferredActions.forEach(function (x) { x(); });
    }

});