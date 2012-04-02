/*
Copyright 2011 Newcastle University

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
Numbas.queueScript('scripts/jme-variables.js',['schedule','jme','xml','util'],function() {

var jme = Numbas.jme;
var job = Numbas.schedule.add;

jme.variables = {
	makeFunctions: function(xml)
	{
		var tmpFunctions = [];

		//work out functions
		var functionNodes = xml.selectNodes('functions/function');
		if(!functionNodes)
			return {};

		//first pass: get function names and types
		for(var i=0; i<functionNodes.length; i++)
		{
			var name = functionNodes[i].getAttribute('name').toLowerCase();

			var definition = functionNodes[i].getAttribute('definition');
			var language = functionNodes[i].getAttribute('language');

			var outtype = functionNodes[i].getAttribute('outtype').toLowerCase();

			var parameterNodes = functionNodes[i].selectNodes('parameters/parameter');
			var parameters = [];
			for(var j=0; j<parameterNodes.length; j++)
			{
				parameters.push({
					name: parameterNodes[j].getAttribute('name'),
					type: parameterNodes[j].getAttribute('type').toLowerCase()
				});
			}
			tmpFunctions.push({
				name: name,
				definition: definition,
				language: language,
				outtype: outtype,
				parameters: parameters
			});

		}
		return jme.variables.compileFunctions(tmpFunctions);
	},
	
	compileFunctions: function(tmpFunctions) 
	{
		var functions = {};
		for(var i=0;i<tmpFunctions.length;i++)
		{
			var tmpfn = tmpFunctions[i];

			var intype = [],
				paramNames = [];

			tmpfn.parameters.map(function(p) {
				intype.push(jme.types[p.type]);
				paramNames.push(p.name);
			});

			var outcons = jme.types[tmpfn.outtype];

			var fn = new jme.funcObj(tmpfn.name,intype,outcons,null,true);

			switch(tmpfn.language)
			{
			case 'jme':
				fn.tree = jme.compile(tmpfn.definition,functions);

				fn.evaluate = function(args,variables,functions)
				{
					nvariables = Numbas.util.copyobj(variables);

					for(var j=0;j<args.length;j++)
					{
						nvariables[paramNames[j]] = jme.evaluate(args[j],variables,functions);
					}
					return jme.evaluate(this.tree,nvariables,functions);
				}
				break;
			case 'javascript':
				var preamble='(function('+paramNames.join(',')+'){';
				var math = Numbas.math, 
					util = Numbas.util;
				var jfn = eval(preamble+tmpfn.definition+'})');
				fn.evaluate = function(args,variables,functions)
				{
					args = args.map(function(a){return jme.evaluate(a,variables,functions).value});
					try {
						var val = jfn.apply(this,args);
						if(!val.type)
							val = new outcons(val);
						return val;
					}
					catch(e)
					{
						throw(new Numbas.Error('jme.user javascript error',tmpfn.name,e.message));
					}
				}
				break;
			}

			if(functions[name]===undefined)
				functions[name] = [];
			functions[name].push(fn);
		}
		return functions;
	},

	makeVariables: function(xml,functions)
	{
		var variableNodes = xml.selectNodes('variables/variable');	//get variable definitions out of XML
		if(!variableNodes)
			return {};

		//list of variable names to ignore because they don't make sense
		var ignoreVariables = ['pi','e','date','year','month','monthname','day','dayofweek','dayofweekname','hour24','hour','minute','second','msecond','firstcdrom'];

		//evaluate variables - work out dependency structure, then evaluate from definitions in correct order
		var todo = {};
		for( var i=0; i<variableNodes.length; i++ )
		{
			var name = variableNodes[i].getAttribute('name').toLowerCase();
			if(!ignoreVariables.contains(name))
			{
				var value = variableNodes[i].getAttribute('value');

				var vars = [];

				var tree = jme.compile(value,functions,true);
				vars = vars.merge(jme.findvars(tree));
				todo[name]={
					tree: tree,
					vars: vars
				};
			}
		}
		function compute(name,todo,variables,path)
		{
			if(variables[name]!==undefined)
				return;

			if(path===undefined)
				path=[];


			if(path.contains(name))
			{
				throw(new Numbas.Error('jme.variables.circular reference',name,path));
			}

			var v = todo[name];

			if(v===undefined)
				throw(new Numbas.Error('jme.variables.variable not defined',name));

			//work out dependencies
			for(var i=0;i<v.vars.length;i++)
			{
				var x=v.vars[i];
				if(variables[x]===undefined)
				{
					var newpath = path.slice(0);
					newpath.splice(0,0,name);
					compute(x,todo,variables,newpath);
				}
			}

			variables[name] = jme.evaluate(v.tree,variables,functions);
		}
		variables = {};
		for(var x in todo)
		{
			compute(x,todo,variables);
		}
		return variables;
	}
};

});
