// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import { ImagePlus, Link2, Trash2, UserRound } from 'lucide-react'
import { promptDialog } from '../../../components/ConfirmDialog'
import { Modal } from '../../../components/Modal'
import { errorMessage } from '../../../lib/api'
import { FetchPicture } from '../../../lib/backend'
import { cropPhoto, readFileAsDataUrl, wholePhoto, type CropArea } from '../../../lib/resumes/photo'
import { toast } from '../../../lib/toast'
import { useResume, useUpdate } from '../editorContext'
import { ColorField } from '../ui/ColorField'
import { Fold, Segmented, Slider, Toggle } from '../ui/controls'

/** The photo: pick and crop it, then size, shape and border. */
export function PictureCard() {
  const picture = useResume().picture
  const update = useUpdate()
  const [cropping, setCropping] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = <K extends keyof typeof picture>(key: K, value: (typeof picture)[K]) => update((d) => void (d.picture[key] = value))

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setCropping(await readFileAsDataUrl(file))
    } catch {
      toast.error('Could not read that file')
    }
  }

  // The download goes through the app's guarded fetcher: public web addresses only, images only.
  const fromLink = async () => {
    const url = (await promptDialog({ title: 'Photo from a link', label: 'Image address (https://…)', confirmLabel: 'Download' }))?.trim()
    if (!url) return
    try {
      setCropping(await FetchPicture(url))
    } catch (err) {
      toast.error(`The photo couldn't be downloaded: ${errorMessage(err)}`)
    }
  }

  return (
    <Fold title="Picture" icon={<UserRound size={15} className="shrink-0 text-indigo-300" />}>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-black/30">
          {picture.url ? <img src={picture.url} alt="" className="h-full w-full object-cover" /> : <UserRound size={22} className="text-ink-3" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={13} /> {picture.url ? 'Replace' : 'Add photo'}
          </button>
          <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => void fromLink()}>
            <Link2 size={13} /> From a link
          </button>
          {picture.url && (
            <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => set('url', '')}>
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {picture.url && (
        <>
          <Toggle label="Hide from the page" checked={picture.hidden} onChange={(v) => set('hidden', v)} />
          <Segmented label="Fit" options={[{ value: 'cover', label: 'Fill the frame' }, { value: 'contain', label: 'Show it whole' }]} value={picture.fit} onChange={(v) => set('fit', v)} />
          <Slider label="Size" value={picture.size} min={32} max={512} unit=" pt" onChange={(v) => set('size', v)} />
          <Slider label="Aspect ratio" value={picture.aspectRatio} min={0.5} max={2.5} step={0.05} onChange={(v) => set('aspectRatio', v)} />
          <Slider label="Corner radius" value={picture.borderRadius} min={0} max={100} unit=" pt" onChange={(v) => set('borderRadius', v)} />
          <Slider label="Border" value={picture.borderWidth} min={0} max={12} unit=" pt" onChange={(v) => set('borderWidth', v)} />
          {picture.borderWidth > 0 && <ColorField label="Border colour" value={picture.borderColor} onChange={(v) => set('borderColor', v)} />}
        </>
      )}
      {cropping && (
        <CropModal
          source={cropping}
          aspect={picture.aspectRatio || 1}
          onClose={() => setCropping(null)}
          onDone={(url) => {
            update((d) => {
              d.picture.url = url
              d.picture.hidden = false
            })
            setCropping(null)
          }}
        />
      )}
    </Fold>
  )
}

function CropModal({ source, aspect, onClose, onDone }: { source: string; aspect: number; onClose: () => void; onDone: (url: string) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<CropArea | null>(null)

  const finish = async (draw: () => Promise<string>) => {
    try {
      onDone(await draw())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use the photo')
    }
  }

  return (
    <Modal title="Crop photo" onClose={onClose}>
      <div className="relative h-72 overflow-hidden rounded-xl bg-black">
        <Cropper image={source} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
      </div>
      <div className="mt-4">
        <Slider label="Zoom" value={zoom} min={1} max={3} step={0.05} unit="×" onChange={setZoom} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void finish(() => wholePhoto(source))}>
          Use without cropping
        </button>
        <button type="button" className="btn btn-primary" onClick={() => area && void finish(() => cropPhoto(source, area))} disabled={!area}>
          Use photo
        </button>
      </div>
    </Modal>
  )
}
