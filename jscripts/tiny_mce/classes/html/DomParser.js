/**
 * DomParser.js
 *
 * Copyright 2010, Moxiecode Systems AB
 * Released under LGPL License.
 *
 * License: http://tinymce.moxiecode.com/license
 * Contributing: http://tinymce.moxiecode.com/contributing
 */

(function(tinymce) {
	tinymce.html.DomParser = function(settings, schema) {
		var self = this, nodeFilters = {}, attributeFilters = [];

		settings = settings || {};
		settings.root_name = settings.root_name || 'body';

		function fixInvalidChildren(nodes) {
			var ni, node, parent, parents, newParent, currentNode, tempNode, childClone, emptyElements = schema.getEmptyElements();

			for (ni = 0; ni < nodes.length; ni++) {
				node = nodes[ni];

				// Get list of all parent nodes until we find a valid parent to stick the child into
				parents = [node];
				for (parent = node.parent; parent && !schema.isValidChild(parent.name, node.name); parent = parent.parent)
					parents.push(parent);

				// Found a suitable parent
				if (parent && parent !== node) {
					// Reverse the array since it makes looping easier
					parents.reverse();

					// Clone the related parent and insert that after the moved node
					newParent = currentNode = parents[0].clone();

					// Start cloning and moving children on the left side of the target node
					for (i = 0; i < parents.length - 1; i++) {
						if (schema.isValidChild(currentNode.name, parents[i].name)) {
							tempNode = parents[i].clone();
							currentNode.append(tempNode);
						} else
							tempNode = currentNode;

						for (childNode = parents[i].firstChild; childNode && childNode != parents[i + 1]; childNode = childNode.next) {
							tempNode.append(childNode);
						}

						currentNode = tempNode;
					}

					if (!newParent.isEmpty(emptyElements)) {
						parent.insert(newParent, parents[0], true);
						parent.insert(node, newParent);
					} else {
						parent.insert(node, parents[0], true);
					}

					if (parents[0].isEmpty(emptyElements)) {
						parents[0].remove();
					}
				} else {
					// Try wrapping the element in a DIV
					if (schema.isValidChild(node.parent.name, 'div') && schema.isValidChild('div', node.name)) {
						tempNode = new tinymce.html.Node('div', 1);
						node.parent.insert(tempNode, node);
						tempNode.append(node);
					} else {
						// We failed wrapping it, then remove it
						if (node.name === 'style')
							node.remove();
						else
							node.unwrap();
					}
				}
			}
		}

		self.addNodeFilter = function(name, callback) {
			tinymce.each(tinymce.explode(name), function(name) {
				var list = nodeFilters[name];

				if (!list)
					nodeFilters[name] = list = [];

				list.push(callback);
			});
		};

		self.addAttributeFilter = function(name, callback) {
			tinymce.each(tinymce.explode(name), function(name) {
				var i;

				for (i = 0; i < attributeFilters.length; i++) {
					if (attributeFilters[i].name === name) {
						attributeFilters[i].callbacks.push(callback);
						return;
					}
				}

				attributeFilters.push({name: name, callbacks: [callback]});
			});
		};

		self.parse = function(html) {
			var parser, rootNode, node, Node = tinymce.html.Node, matchedNodes = {}, matchedAttributes = {},
				i, l, fi, fl, list, name, blockElements, startWhiteSpaceRegExp, invalidChildren = [],
				endWhiteSpaceRegExp, allWhiteSpaceRegExp, whiteSpaceElements;

			blockElements = tinymce.extend({
				script: 1,
				style: 1
			}, schema.getBlockElements());

			whiteSpaceElements = schema.getWhiteSpaceElements();
			startWhiteSpaceRegExp = /^[ \t\r\n]+/;
			endWhiteSpaceRegExp = /[ \t\r\n]+$/;
			allWhiteSpaceRegExp = /[ \t\r\n]+/g;

			function createNode(name, type) {
				var node = new Node(name, type), list;

				if (name in nodeFilters) {
					list = matchedNodes[name];

					if (list)
						list.push(node);
					else
						matchedNodes[name] = [node];
				}

				return node;
			}

			parser = new tinymce.html.SaxParser(tinymce.extend({
				cdata: function(text) {
					node.append(createNode('#cdata', 4)).value = text;
				},

				text: function(text, raw) {
					var textNode;

					// Trim all redundant whitespace on non white space elements
					if (!whiteSpaceElements[node.name]) {
						text = text.replace(allWhiteSpaceRegExp, ' ');

						if (node.lastChild && blockElements[node.lastChild.name])
							text = text.replace(startWhiteSpaceRegExp, '');
					}

					// Do we need to create the node
					if (text.length !== 0) {
						textNode = createNode('#text', 3);
						textNode.raw = !!raw;
						node.append(textNode).value = text;
					}
				},

				comment: function(text) {
					node.append(createNode('#comment', 8)).value = text;
				},

				pi: function(text) {
					node.append(createNode('#pi', 7)).value = text;
				},

				doctype: function(text) {
					node.append(createNode('#doctype', 10)).value = text;
				},

				start: function(name, attrs, empty) {
					var newNode, attrFiltersLen, elementRule, textNode, attrName;

					elementRule = schema.getElementRule(name);
					if (elementRule) {
						newNode = createNode(elementRule.outputName || name, 1);
						newNode.attributes = attrs;
						newNode.empty = empty;

						node.append(newNode);

						// Check if element position is valid
						if (!schema.isValidChild(node.name, newNode.name))
							invalidChildren.push(newNode);

						attrFiltersLen = attributeFilters.length;
						while (attrFiltersLen--) {
							attrName = attributeFilters[attrFiltersLen].name;

							if (attrName in attrs.map) {
								list = matchedAttributes[attrName];

								if (list)
									list.push(newNode);
								else
									matchedAttributes[attrName] = [newNode];
							}
						}

						if (empty) {
							if (blockElements[name]) {
								// Trim whitespace before block
								for (textNode = newNode.prev; textNode && textNode.type === 3; textNode = textNode.prev)
									textNode.value = textNode.value.replace(endWhiteSpaceRegExp, '');
							}
						} else
							node = newNode;
					}
				},

				end: function(name) {
					var textNode, elementRule;

					elementRule = schema.getElementRule(name);
					if (elementRule) {
						if (blockElements[name]) {
							if (!whiteSpaceElements[node.name]) {
								// Trim whitespace at beginning of block
								for (textNode = node.firstChild; textNode && textNode.type === 3; textNode = textNode.next)
									textNode.value = textNode.value.replace(startWhiteSpaceRegExp, '');

								// Trim whitespace at end of block
								for (textNode = node.lastChild; textNode && textNode.type === 3; textNode = textNode.prev)
									textNode.value = textNode.value.replace(endWhiteSpaceRegExp, '');
							}

							// Trim start white space
							textNode = node.prev;
							if (textNode && textNode.type === 3)
								textNode.value = textNode.value.replace(startWhiteSpaceRegExp, '');
						}

						// Handle empty nodes
						if (elementRule.removeEmpty || elementRule.paddEmpty) {
							if (node.isEmpty(schema.getEmptyElements())) {
								if (elementRule.paddEmpty)
									node.clear().append(new tinymce.html.Node('#text', '3')).value = '\u00a0';
								else
									return node.remove();
							}
						}

						node = node.parent;
					}
				}
			}, settings), schema);

			rootNode = node = new Node(settings.root_name, 8);

			parser.parse(html);

			fixInvalidChildren(invalidChildren);

			// Run node filters
			for (name in matchedNodes) {
				list = nodeFilters[name];

				for (i = 0, l = list.length; i < l; i++) {
					list[i](matchedNodes[name], name);
				}
			}

			// Run attribute filters
			for (i = 0, l = attributeFilters.length; i < l; i++) {
				list = attributeFilters[i];

				if (list.name in matchedAttributes) {
					for (fi = 0, fl = list.callbacks.length; fi < fl; fi++) {
						list.callbacks[fi](matchedAttributes[list.name], list.name);
					}
				}
			}

			return rootNode;
		};
	}
})(tinymce);