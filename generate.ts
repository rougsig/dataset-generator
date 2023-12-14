import * as fs from 'fs'
import {get, set} from 'lodash-es'
import sharp from 'sharp'

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

const readCaptions = () => {
  const captions = {}

  const baseDir = ['.', 'dataset', 'captions']
  for (const file of readDir(baseDir)) {
    const filename = file.slice(0, file.lastIndexOf('.')).split('__')
    const text = readTextFile([...baseDir, file]).trim()
    set(captions, filename, text)
  }

  return captions
}

type BodyImage = { type: 'body', path: string, caption: string }
type OutfitImage = { type: 'outfit', path: string, frontPath: string | null, caption: string }
type ShoesImage = { type: 'shoes', path: string, caption: string }
type HairImage = { type: 'hair', path: string | null, frontPath: string, caption: string }

type Image =
  | BodyImage
  | OutfitImage
  | ShoesImage
  | HairImage

const readImages = (group: string, captions: object) => {
  const filenames: string[][] = []
  const dataset = {}

  const baseDir = ['.', 'dataset', group]
  for (const file of readDir(baseDir)) {
    const filename = file.slice(0, file.lastIndexOf('.')).split('__')
    filenames.push(filename)

    const path = [...baseDir, file].join('/')
    set(dataset, filename, path)
  }

  const images: Image[] = []

  const handleBody = (filename: string[]) => {
    const caption = get(captions, filename)
    if (caption == null) throw new Error(`Caption not found for image: ${filename.join('__')}`)

    const path = get(dataset, filename)
    if (path == null) throw new Error(`Image not found for image: ${filename.join('__')}`)

    images.push({
      type: 'body',
      path: path,
      caption: caption,
    })
  }

  const handleOutfit = (filename: string[]) => {
    if (!(filename[1] == 'outfit_curvy' || filename[1] == 'outfit_skinny')) {
      console.log('Skip image', filename)
      return
    }

    const caption = get(captions, filename)
    if (caption == null) throw new Error(`Caption not found for image: ${filename.join('__')}`)

    const path = get(dataset, filename)
    if (path == null) throw new Error(`Image not found for image: ${filename.join('__')}`)

    const front = get(dataset, [filename[0], 'outfitfront', filename[1], filename[2]])

    images.push({
      type: 'outfit',
      path: path,
      frontPath: front ?? null,
      caption: caption,
    })
  }

  const handleHair = (filename: string[]) => {
    if (filename[1] != 'hair') {
      console.log('Skip image', filename)
      return
    }

    const caption = get(captions, filename)
    if (caption == null) throw new Error(`Caption not found for image: ${filename.join('__')}`)

    const frontPath = get(dataset, filename)
    if (frontPath == null) throw new Error(`Image not found for image: ${filename.join('__')}`)

    const back = get(dataset, [filename[0], 'hairback', filename[2]])

    images.push({
      type: 'hair',
      path: back ?? null,
      frontPath: frontPath,
      caption: caption,
    })
  }

  const handleShoes = (filename: string[]) => {
    const caption = get(captions, filename)
    if (caption == null) throw new Error(`Caption not found for image: ${filename.join('__')}`)

    const path = get(dataset, filename)
    if (path == null) throw new Error(`Image not found for image: ${filename.join('__')}`)

    images.push({
      type: 'shoes',
      path: path,
      caption: caption,
    })
  }

  const typeHandlers: Record<string, (filename: string[]) => void> = {
    'OLIVE_SKINNY': handleBody,
    'BLACK1': handleBody,
    'CAUCASIAN': handleBody,
    'daywear': handleOutfit,
    'eveningwear': handleOutfit,
    'partywear': handleOutfit,
    'sleep': handleOutfit,
    'hair': handleHair,
    'shoes': handleShoes,
  }

  for (const filename of filenames) {
    const dotIndex = filename[0].indexOf('.')
    const type = dotIndex != -1 ? filename[0].slice(0, dotIndex) : filename[0]

    const handler = typeHandlers[type]
    if (handler == null) throw new Error(`Unknown image type: '${type}'`)
    handler(filename)
  }

  return images
}

type GenerateHandler = (
  body: BodyImage,
  outfit: OutfitImage,
  shoes: ShoesImage,
  hair: HairImage,
  index: number,
) => Promise<boolean>

class Generator {
  constructor(private readonly images: Image[]) {
  }

  async generate(block: GenerateHandler) {
    const bodies: BodyImage[] = []
    const outfits: OutfitImage[] = []
    const hairs: HairImage[] = []
    const shoess: ShoesImage[] = []

    this.images.forEach(image => {
      switch (image.type) {
        case 'body':
          bodies.push(image)
          break
        case 'outfit':
          outfits.push(image)
          break
        case 'shoes':
          shoess.push(image)
          break
        case 'hair':
          hairs.push(image)
          break
      }
    })

    let stopped = false
    let index = 0

    for (const body of bodies) {
      for (const outfit of outfits) {
        for (const shoes of shoess) {
          const hair = hairs[index % hairs.length]
          if (stopped) continue

          stopped = await block(body, outfit, shoes, hair, index)
          index++
        }
      }
    }
  }
}

const padLeft = (num: number, count: number) => {
  return `${num}`.padStart(count, '0')
}

const generateHandler:
  (group: string) => GenerateHandler =
  (group) => async (body, outfit, shoes, hair, index) => {
    // if (index > 100) return true

    console.log('START', index)
    const caption = [
      body.caption,
      ' with ',
      hair.caption,
      ' wearing ',
      outfit.caption,
      ', ',
      shoes.caption,
    ]

    const baseDir = ['.', 'dataset', 'generated', group]
    mkdir(baseDir)

    const imagePath = [...baseDir, `${padLeft(index, 4)}.webp`]
    const captionPath = [...baseDir, `${padLeft(index, 4)}.txt`]

    writeTextFile(captionPath, caption.join(''))

    const merged = await sharp(body.path)
      .composite(
        [
          {input: hair.path ?? undefined},
          {input: body.path},
          {input: outfit.path},
          {input: shoes.path},
          {input: outfit.frontPath ?? undefined},
          {input: hair.frontPath},
        ].filter(it => it.input != null),
      )
      .flatten({background: '#B6B6B6'})
      .toBuffer()

    await sharp(merged)
      .webp({lossless: true})
      .resize(512, 960)
      .toFile(imagePath.join('/'))

    console.log('COMPLETE', index)
    return false
  }

//
// --- --- ---
//

const captions = readCaptions()

await new Generator(readImages('skinny', captions))
  .generate(generateHandler('skinny'))

await new Generator(readImages('curvy', captions))
  .generate(generateHandler('curvy'))
