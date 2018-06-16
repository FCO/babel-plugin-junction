import * as babylon from "babylon";

const newJunction = (t, jtype, args) => t.newExpression(
    t.identifier("Junction"),
    [
        t.stringLiteral(jtype),
        t.arrayExpression(args)
    ]
)

const buildRun = (t, orig, junctName) => {
    return t.callExpression(
        t.memberExpression(
            t.identifier(junctName),
            t.identifier("run")
        ),
        [
            t.arrowFunctionExpression(
                [
                    t.identifier(junctName)
                ],
                t.blockStatement([
                    t.returnStatement(
                        t.objectExpression([
                            t.objectProperty(
                                t.identifier("new"),
                                orig.node
                            ),
                            t.objectProperty(
                                t.identifier("self"),
                                t.identifier(junctName)
                            )
                        ])
                    )
                ])
            )
        ]
    )
}

const replaceStatement = (t, varName, bind) => {
    let exp;
    do {
        exp = bind
    } while(bind = bind.findParent(n => n.isExpression()))
    exp.replaceWith(buildRun(t, exp, varName))
    const ifSt = exp.findParent(n => n.isIfStatement())
    if(ifSt) {
        exp.replaceWith(
            t.callExpression(
                t.memberExpression(
                    exp.node,
                    t.identifier("toBool")
                ),
                []
            )
        )
    }
}

const methodList = [
    "toString",
    "run",
    "toBool",
]

const addJunctionClass = (t, args) => babylon.parse(`
    class Junction {
        constructor(booleaner, values) {
            this.booleaner = booleaner
            this.boolFunc  = Junction[booleaner]
            this.values    = values
        }
        run(func) {
            let new_values = [];
            this.values = this.values.map(i => {
                const o = func(i)
                new_values.push(o.new)
                return o.self
            })
            return new Junction(this.booleaner, new_values)
        }
        toString() {
            return this.booleaner + "(" + this.values.map(val => val.toString()).join(", ") + ")"
        }
        toBool() {
            return this.boolFunc(this.values)
        }
    }

    Junction.any  = arr => arr.filter(i => i && true).length > 0
    Junction.all  = arr => arr.filter(i => i && true).length == arr.length
    Junction.one  = arr => arr.filter(i => i && true).length == 1
    Junction.none = arr => arr.filter(i => i && true).length == 0
`).program.body

const junctTypes = [
    "any",
    "all",
    "one",
    "none"
]

let counter = 0
export default function (babel) {
    const { types: t } = babel;
    return {
        name: "ast-transform", // not required
        visitor: {
            Program(path) {
                path.node.body.unshift(...addJunctionClass(t, path.node.body))
            },
            Identifier(path) {
                const junctType = path.node.name
                if (junctTypes.indexOf(path.node.name) < 0 || !path.parentPath.isCallExpression()) {
                    return
                }
                const par = path.parentPath
                par.replaceWith(newJunction(t, junctType, par.node.arguments))
                const varDecl = par.findParent(n => n.isVariableDeclarator())
                if(varDecl) {
                    varDecl.scope
                        .getBinding(varDecl.node.id.name)
                        .referencePaths
                        .forEach(bind => {
                            if(
                                t.isMemberExpression(bind.parent)
                                && methodList.indexOf(bind.parent.property.name) >= 0
                            )
                                return
                            replaceStatement(t, varDecl.node.id.name, bind)
                        })
                } else {
                    let exp, bind = par;
                    do {
                        exp = bind
                    } while(bind = bind.findParent(n => n.isExpression()))
                    const orig = par.node
                    const uniq = t.identifier("_j" + counter++)
                    par.replaceWith(uniq)
                    exp.replaceWith(
                        t.callExpression(
                            t.memberExpression(
                                orig,
                                t.identifier("run")
                            ),
                            [
                                t.arrowFunctionExpression(
                                    [
                                        uniq
                                    ],
                                    t.blockStatement([
                                        t.returnStatement(
                                            t.objectExpression([
                                                t.objectProperty(
                                                    t.identifier("new"),
                                                    exp.node,
                                                ),
                                                t.objectProperty(
                                                    t.identifier("self"),
                                                    uniq
                                                )
                                            ])
                                        )
                                    ])
                                )
                            ]
                        )
                    )
                    const ifSt = exp.findParent(n => n.isIfStatement())
                    if(ifSt) {
                        exp.replaceWith(
                            t.callExpression(
                                t.memberExpression(
                                    exp.node,
                                    t.identifier("toBool")
                                ),
                                []
                            )
                        )
                    }
                }
            }
        }
    }
}

