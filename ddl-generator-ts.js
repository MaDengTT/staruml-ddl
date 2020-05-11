/*
 * Copyright (c) 2014-2018 MKLab. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

const fs = require("fs");
const codegen = require("./codegen-utils");

/**
 * DDL Generator
 */
class DDLGenerator {
  /**
   * @constructor
   *
   * @param {type.ERDDataModel} baseModel
   * @param {string} basePath generated files and directories to be placed
   */
  constructor(baseModel, basePath) {
    /** @member {type.Model} */
    this.baseModel = baseModel;

    /** @member {string} */
    this.basePath = basePath;
  }

  /**
   * Return Indent String based on options
   * @param {Object} options
   * @return {string}
   */
  getIndentString(options) {
    if (options.useTab) {
      return "\t";
    } else {
      var i, len;
      var indent = [];
      for (i = 0, len = options.indentSpaces; i < len; i++) {
        indent.push(" ");
      }
      return indent.join("");
    }
  }

  /**
   * Return Identifier (Quote or not)
   * @param {String} id
   * @param {Object} options
   */
  getId(id, options) {
    // if (options.quoteIdentifiers) {
    //   return '`' + id + '`'
    // }
    return id;
  }

  /**
   * Return Primary Keys for an Entity
   * @param {type.ERDEntity} elem
   * @return {Array.<ERDColumn>}
   */
  getPrimaryKeys(elem) {
    var keys = [];
    elem.columns.forEach(function (col) {
      if (col.primaryKey) {
        keys.push(col);
      }
    });
    return keys;
  }

  /**
   * Return Foreign Keys for an Entity
   * @param {type.ERDEntity} elem
   * @return {Array.<ERDColumn>}
   */
  getForeignKeys(elem) {
    var keys = [];
    elem.columns.forEach(function (col) {
      if (col.foreignKey) {
        keys.push(col);
      }
    });
    return keys;
  }

  ddlTypeToTsType(ddlType, options) {
    var type = ddlType.toUpperCase();
    switch (type) {
      case "INTEGER":
        return "number";
        break;
      case "VARCHAR":
        return "string";
        break;
      case "DATE":
        return "Date";
        break;
      case 'BLOB':
        return 'Buffer';
        break;
      default:
        return "string";
        break;
    }
  }

  ddlTypeToSequelizeDataType(ddlType,length, lenoptions) {
    var type = ddlType.toUpperCase();
    switch (type) {
      case "INTEGER":
        if(length === 0){
          return type
        }else{
          return type+'('+length+')';
        }
        break;
      case "VARCHAR":
        if(length === 0){
          return "STRING"
        }else{
          return "STRING"+'('+length+')';
        }
        break;
      case "DATE":
      case "JSON":
      case "BLOB":
      case "DECIMAL":
      case "TEXT":
      case "CITEXT":
        return type
        break;
      default:
        if(length === 0){
          return type
        }else{
          return type+'('+length+')';
        }
        break;
    }
  }
  /**
   * Return DDL column string
   * @param {type.ERDColumn} elem
   * @param {Object} options
   * @return {String}
   */
  getColumnString(elem, options) {
    var lines = [];
    var self = this;
    var line = self.getId(elem.name, options);
    var id = line;

    var _type = elem.getTypeString();
    var _length = elem.length
    console.log(elem);

    if (_type.trim().length === 0) {
      _type = "INTEGER";
    }

    var dataType = self.ddlTypeToSequelizeDataType(_type,_length,options);

    dataType = 'DataType.'+dataType

    lines.push("@Column("+dataType+")");
    if (elem.primaryKey) {
      lines.push("@PrimaryKey");
    }
    if (elem.primaryKey && id === "id" && _type === "INTEGER") {
      lines.push("@AutoIncrement");
    }
    if (elem.unique) {
      lines.push("@Unique");
    }
    if (!elem.nullable) {
      lines.push('@AllowNull(false)')
    }

    lines.push("@Comment('" + elem.documentation + "')");

    line += "?: " + self.ddlTypeToTsType(_type, options);
    // console.log(id);
    lines.push(line)
    return lines;
  }

  /**
   * Write Foreign Keys
   * @param {StringWriter} codeWriter
   * @param {type.ERDEntity} elem
   * @param {Object} options
   */
  writeForeignKeys(codeWriter, elem, options) {
    var self = this;
    var fks = self.getForeignKeys(elem);
    var ends = elem.getRelationshipEnds(true);

    ends.forEach(function (end) {
      if (end.cardinality === "1") {
        var _pks = self.getPrimaryKeys(end.reference);
        if (_pks.length > 0) {
          var matched = true;
          var matchedFKs = [];
          _pks.forEach(function (pk) {
            var r = fks.find(function (k) {
              return k.referenceTo === pk;
            });
            if (r) {
              matchedFKs.push(r);
            } else {
              matched = false;
            }
          });

          if (matched) {
            fks = fks.filter((e) => {
              return !matchedFKs.includes(e);
            });
            var line = "ALTER TABLE ";
            line += self.getId(elem.name, options) + " ";
            line +=
              "ADD FOREIGN KEY (" +
              matchedFKs
                .map(function (k) {
                  return self.getId(k.name, options);
                })
                .join(", ") +
              ") ";
            line += "REFERENCES " + self.getId(_pks[0]._parent.name, options);
            line +=
              "(" +
              _pks.map(function (k) {
                return self.getId(k.name, options);
              }) +
              ");";
            codeWriter.writeLine(line);
          }
        }
      }
    });
    fks.forEach(function (fk) {
      if (fk.referenceTo) {
        var line = "ALTER TABLE ";
        line += self.getId(elem.name, options) + " ";
        line += "ADD FOREIGN KEY (" + self.getId(fk.name, options) + ") ";
        line +=
          "REFERENCES " + self.getId(fk.referenceTo._parent.name, options);
        line += "(" + self.getId(fk.referenceTo.name, options) + ");";
        codeWriter.writeLine(line);
      }
    });
  }

  /**
   * Write Drop Table
   * @param {StringWriter} codeWriter
   * @param {type.ERDEntity} elem
   * @param {Object} options
   */
  writeDropTable(codeWriter, elem, options) {
    if (options.dbms === "mysql") {
      codeWriter.writeLine(
        "DROP TABLE IF EXISTS " + this.getId(elem.name, options) + ";"
      );
    } else if (options.dbms === "oracle") {
      codeWriter.writeLine(
        "DROP TABLE " + this.getId(elem.name, options) + " CASCADE CONSTRAINTS;"
      );
    }
  }

  /**
   * Write Class
   * @param {StringWriter} codeWriter
   * @param {type.ERDEntity} elem
   * @param {Object} options
   */
  writeClass(codeWriter, elem, options) {
    var self = this;
    var lines = [];
    var primaryKeys = [];
    var uniques = [];
    var _name = elem.name
    _name = _name.charAt(0).toUpperCase() + _name.slice(1)
    var types = ["Table", "Column", "Model", "HasMany", "sequelize-typescript"];
    var includeTypes = [];

    codeWriter.writeLine("import {Table, DataType, Column, Model, AllowNull, AutoIncrement, Unique, PrimaryKey, Comment } from 'sequelize-typescript';")
    codeWriter.writeLine("")
    // Table
    codeWriter.writeLine("@Table({ tableName: '"+elem.name+"'})");
    codeWriter.writeLine(
      "class " + _name + " extends Model<" + _name + "> {"
    );
    codeWriter.writeLine("");
    codeWriter.indent();

    // Columns
    elem.columns.forEach(function (col) {
      if (col.primaryKey) {
        primaryKeys.push(self.getId(col.name, options));
      }
      if (col.unique) {
        uniques.push(self.getId(col.name, options));
      }
      self.getColumnString(col, options).forEach(value=>{
        // codeWriter.indent()
        codeWriter.writeLine(value)
      })
      codeWriter.writeLine('')
      // lines.push(self.getColumnString(col, options));
    });
    codeWriter.outdent()
    codeWriter.writeLine("");
    codeWriter.writeLine("}")
  }

  /**
   * Generate codes from a given element
   * @param {type.Model} elem
   * @param {string} path
   * @param {Object} options
   * @return {$.Promise}
   */
  generate(elem, basePath, options) {
    var codeWriter;

    // DataModel
    if (elem instanceof type.ERDDataModel) {
      codeWriter = new codegen.CodeWriter(this.getIndentString(options));

      // // Drop Tables
      // if (options.dropTable) {
      //   if (options.dbms === 'mysql') {
      //     codeWriter.writeLine('SET FOREIGN_KEY_CHECKS = 0;')
      //   }
      //   elem.ownedElements.forEach(e => {
      //     if (e instanceof type.ERDEntity) {
      //       this.writeDropTable(codeWriter, e, options)
      //     }
      //   })
      //   if (options.dbms === 'mysql') {
      //     codeWriter.writeLine('SET FOREIGN_KEY_CHECKS = 1;')
      //   }
      //   codeWriter.writeLine()
      // }

      elem.ownedElements.forEach((e) => {
        if (e instanceof type.ERDEntity) {
          var classWriter;
          classWriter = new codegen.CodeWriter(this.getIndentString(options));
          this.writeClass(codeWriter, e, options);
          var file = e.name+'.model.ts'
          file = file.charAt(0).toUpperCase() + file.slice(1)
          fs.writeFileSync(basePath+'/'+file, codeWriter.getData());
          codeWriter.clear()
        }
      });

      // // Tables
      // elem.ownedElements.forEach((e) => {
      //   if (e instanceof type.ERDEntity) {
      //     this.writeClass(codeWriter, e, options);
      //   }
      // });

      // // Foreign Keys
      // elem.ownedElements.forEach((e) => {
      //   if (e instanceof type.ERDEntity) {
      //     this.writeForeignKeys(codeWriter, e, options);
      //   }
      // });

      // Others (Nothing generated.)
      // fs.writeFileSync(basePath, codeWriter.getData());
    }
  }
}

/**
 * Generate
 * @param {type.Model} baseModel
 * @param {string} basePath
 * @param {Object} options
 */
function generate(baseModel, basePath, options) {
  var generator = new DDLGenerator(baseModel, basePath);
  return generator.generate(baseModel, basePath, options);
}

exports.generate = generate;
