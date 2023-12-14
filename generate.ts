import sharp from 'sharp'
import * as fs from 'fs'
import deasync from 'deasync'

const readDir = (path: string[]) => {
  return fs.readdirSync(path.join('/'))
}

const readTextFile = (path: string[]) => {
  return fs.readFileSync(path.join('/')).toString()
}

const mkdir = (path: string[]) => {
  fs.mkdirSync(path.join('/'), {recursive: true})
}

const writeTextFile = (path: string[], text: string) => {
  fs.writeFileSync(path.join('/'), text)
}

const readCaptions = async () => {
  const captions: Record<string, string> = {}

  const baseDir = ['.', 'dataset', 'captions']
  for (const file of readDir(baseDir)) {
    const key = file.slice(0, file.lastIndexOf('.'))
    captions[key] = readTextFile([...baseDir, file])
  }

  return captions
}

type Image = {
  type: 'body' | 'hair' | 'outfit' | 'shoes'
  name: string
  path: string
}

type Dataset = Record<Image['type'], Image[]> & {
  captions: Record<string, string>
}

type GenerateHandler = (
  {...args}: {
    captions: Record<string, string>,
    body: Image,
    outfit: Image,
    shoes: Image,
    hair: Image,
    index: number
  },
) => Promise<boolean>

class Generator {
  constructor(private readonly dataset: Dataset) {
  }

  private nextHair(index: number): Image {
    return this.dataset.hair[index % this.dataset.hair.length]
  }

  async generate(block: GenerateHandler) {
    let index = 0

    for (const body of this.dataset.body) {
      for (const outfit of this.dataset.outfit) {
        for (const shoes of this.dataset.shoes) {
          const hair = this.nextHair(index)
          const stop = await block({captions: this.dataset.captions, body, outfit, shoes, hair, index})
          index++

          if (stop) break
        }
      }
    }
  }
}

const readImages = async (group: string) => {
  const dataset: Dataset = {
    body: [],
    hair: [],
    outfit: [],
    shoes: [],
    captions: await readCaptions(),
  }

  const types: Record<string, Image['type']> = {
    'shoes': 'shoes',
    'hair': 'hair',
    'eveningwear': 'outfit',
    'partywear': 'outfit',
    'sleep': 'outfit',
    'daywear': 'outfit',
    'CAUCASIAN__CAUCASIAN': 'body',
    'BLACK1__BLACK1': 'body',
    'OLIVE_SKINNY__OLIVE_SKINNY': 'body',
  }

  const baseDir = ['.', 'dataset', group]
  for (const file of readDir(baseDir)) {
    const name = file.slice(0, file.lastIndexOf('.'))
    const path = [...baseDir, file].join('/')

    const type = types[file.slice(0, file.indexOf('.'))]
    if (type == null) throw new Error(`Unknown image type ${file}`)

    dataset[type].push({
      type: type,
      name: name,
      path: path,
    })
  }

  return dataset
}

const padLeft = (num: number, count: number) => {
  return `${num}`.padStart(count, '0')
}

const runBlocking = (promise: () => Promise<unknown>) => {
  let done = false
  promise()
    .then(() => console.log('DONE'))
    .finally(() => done = true)
  deasync.loopWhile(() => !done)
  console.log('DONE', done)
}

const generateHandler:
  (group: string) => GenerateHandler =
  (group) => async ({captions, body, outfit, shoes, hair, index}) => {
    if (index > 100) return true

    const caption = [
      captions[body.name].trim(),
      ' with ',
      captions[hair.name].trim(),
      ' wearing ',
      captions[outfit.name].trim(),
      ', ',
      captions[shoes.name].trim(),
    ]

    const baseDir = ['.', 'dataset', 'generated', group]
    mkdir(baseDir)

    const imagePath = [...baseDir, `${padLeft(index, 4)}.webp`]
    const captionPath = [...baseDir, `${padLeft(index, 4)}.txt`]

    writeTextFile(captionPath, caption.join(''))

    runBlocking(() => {
      console.log('start image generation', imagePath)
      return sharp(body.path)
        // .composite([
        //   {input: body.path},
        //   {input: outfit.path},
        //   {input: shoes.path},
        //   {input: hair.path},
        // ])
        // .resize(512, 960)
        // .flatten({background: '#B6B6B6'})
        .webp({lossless: true})
        .toFile(imagePath.join('/'))
    })

    return false
  }

// const skinnyGenerator = new Generator(await readImages('skinny'))
// (async () => {
//   try {
//
//
//   } catch (e) {
//     console.error(e)
//     throw e
//   }
// })()

// const curvyGenerator = new Generator(await readImages('curvy'))
// await curvyGenerator.generate(generateHandler('curvy'))
