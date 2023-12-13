import sharp from 'sharp'
import $ from 'https://deno.land/x/dax@0.35.0/mod.ts'

const readCaptions = async () => {
  const captions = new Map<string, string>()

  const baseDir = ['.', 'dataset', 'captions']
  for await (const file of Deno.readDir(baseDir.join('/'))) {
    const key = file.name.slice(0, file.name.lastIndexOf('.'))
    const value = await Deno.readTextFile([...baseDir, file.name].join('/'))

    captions.set(key, value)
  }
}

const captions = await readCaptions()
