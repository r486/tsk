'use strict' // 2021-04-06 09.35

const fs = require('fs')
const cp = require('child_process')
const path = require('path')

const STEP = false
const LINE_LENGTH = 40

void function main ()
{
    process.on('uncaughtException', err =>
    {
        console.log('='.repeat(LINE_LENGTH))
        console.log(err)
        console.log('='.repeat(LINE_LENGTH) + '\nterminated')
        process.exit(1)
    })

    process.on('exit', () =>
    {
        fs.rmSync(`${ __dirname }/tsk.tmp.js`, { force: true })
    })

    process.chdir(__dirname)

    // maybe initializing

    if (process.argv[2] === '-tskinit')
    {
        fs.writeFileSync('./tsk.manifest.js', `\
exports.hello =
[
    {
        module: 'lib/hello'
    }
]

exports.world =
[
    {
        module: 'lib/world',
        config:
        {
            exclamation: false
        }
    }
]

exports.helloworld =
[
    {
        module: 'lib/hello'
    },
    {
        module: 'lib/world',
        config:
        {
            exclamation: true
        }
    }
]`)

        fs.mkdirSync('./lib/hello', { recursive: true })
        fs.writeFileSync('./lib/hello/index.js', `module.exports = function ()\n{\n    console.log('hello')\n}`)
        fs.mkdirSync('./lib/world', { recursive: true })
        fs.writeFileSync('./lib/world/index.js', `module.exports = function (config)\n{\n    console.log(config.exclamation ? 'world!' : 'world')\n}`)

        console.log('initialized the example manifest and modules')
        process.exit()
    }

    // validation

    if (!fs.existsSync('./tsk.manifest.js'))
    {
        throw `missing the manifest file. create it manually or run -tskinit`
    }

    try
    {
        var manifest = require('./tsk.manifest.js')
    }
    catch (err)
    {
        console.log(err)
        throw `failed to load the manifest`
    }

    if (!manifest || !Object.keys(manifest).length)
    {
        throw `manifest file does not export any sequences`
    }

    const sequence = manifest[process.argv[2]]

    if (!sequence)
    {
        console.log('available sequences:')
        for (const key in manifest) console.log(`   ${ key }`)
        process.exit(1)
    }

    if (!(sequence instanceof Array))
    {
        throw `the sequence must be an array of module entries`
    }

    if (!sequence.length)
    {
        throw `the sequence is empty`
    }

    for (let i = 0; i < sequence.length; i++)
    {
        const entry = sequence[i]

        if (!entry.module)
        {
            throw `no module specified in sequence entry ${ i }:\n${ require('util').inspect(entry) }`
        }

        try
        {
            require.resolve(path.resolve(entry.module))
        }
        catch (err)
        {
            throw `failed to locate module ${ entry.module }`
        }
    }

    for (let i = 0; i < sequence.length; i++)
    {
        console.log(`${ (i + 1).toString().padEnd(sequence.length.toString().length, ' ') } ${ sequence[i].module }`)
    }

    //

    async function prompt (i)
    {
        return new Promise(resolve =>
        {
            process.stdout.write(`Press Enter to ${ i ? 'continue' : 'start' }, Ctrl+C to exit. Next (${ i + 1 }/${ sequence.length }): ${ sequence[i].module }`)
            process.stdin.once('data', () => resolve())
        })
    }

    async function run (i = 0, tt = 0)
    {
        if ((STEP || process.argv.includes('-step')) && !process.argv.includes('-run'))
        {
            await prompt(i)
        }

        const rpath = require.resolve(path.resolve(sequence[i].module))
        console.log(`${ '-'.repeat(LINE_LENGTH) }\n${ i + 1 }/${ sequence.length } ${ sequence[i].module } (${ rpath })\n`)
        const tpath = `${ __dirname }/tsk.tmp.js`
        fs.writeFileSync(tpath, `require('${ rpath.replace(/'/g, `\\'`) }')(require('./tsk.manifest.js')['${ process.argv[2].replace(/'/g, `\\'`) }'][${ i }].config)`)

        const ts = Date.now()

        cp.fork(tpath, process.argv.slice(2), { cwd: process.cwd() }).addListener('close', code =>
        {
            if (code === 0)
            {
                const t = Date.now() - ts
                tt += t
                console.log(`\n${ sequence[i].module } : OK (${ t }ms)`)

                if (++i < sequence.length)
                {
                    return run(i, tt)
                }
                else
                {
                    console.log('-'.repeat(LINE_LENGTH) + `\nOK (${ tt }ms)`)
                    process.stdin.unref()
                    fs.rmSync(tpath)
                }
            }
            else
            {
                console.log('-'.repeat(LINE_LENGTH) + `\nmodule process exited with a non-zero code (${ code }). terminating`)
                process.stdin.unref()
                process.exit(code)
            }
        })
    }

    run()
}()