// What the console shows in its header: the GPU, its use, its cores, and the memory (macOS and NVIDIA).
import { execFile } from 'node:child_process'
import { totalmem, platform } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** system_profiler SPDisplaysDataType -json → { name, cores }. */
export function parseProfiler(json) {
  const d = JSON.parse(json).SPDisplaysDataType?.[0]
  if (!d) return null
  return { name: d.sppci_model ?? d._name ?? 'GPU', cores: d.sppci_cores ? Number(d.sppci_cores) : null }
}

/** `ioreg -r -d 1 -w0 -c IOAccelerator` → the device utilization in percent (null when absent). */
export function parseIoreg(text) {
  const m = /"Device Utilization %"\s*=\s*(\d+)/.exec(text)
  return m ? Number(m[1]) : null
}

/** nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits */
export function parseNvidia(text) {
  const gpus = text.trim().split('\n').filter(Boolean).map((l) => l.split(',').map((s) => s.trim()))
  return gpus.map(([name, util, used, total]) => ({ name, utilization: Number(util), memory: { usedGb: +(Number(used) / 1024).toFixed(1), totalGb: +(Number(total) / 1024).toFixed(1) } }))
}

let profile = null
/** GPU facts that do not change: read once. `exec(cmd, args)` is injectable for tests. */
async function staticInfo(exec) {
  if (profile) return profile
  profile = { name: 'GPU', cores: null }
  try { profile = parseProfiler((await exec('system_profiler', ['SPDisplaysDataType', '-json'])).stdout) ?? profile } catch { /* not macOS */ }
  return profile
}

export async function gpuInfo({ exec = run, os = platform() } = {}) {
  if (os === 'darwin') {
    const info = await staticInfo(exec)
    let utilization = null
    try { utilization = parseIoreg((await exec('ioreg', ['-r', '-d', '1', '-w0', '-c', 'IOAccelerator'])).stdout) } catch { /* no reading */ }
    // Apple silicon shares the memory with the CPU: the whole RAM is what the GPU can use.
    return { platform: os, name: info.name, cores: info.cores, utilization, memory: { totalGb: +(totalmem() / 1024 ** 3).toFixed(0), usedGb: null, unified: true } }
  }
  try {
    const [g] = parseNvidia((await exec('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'])).stdout)
    if (g) return { platform: os, name: g.name, cores: null, utilization: g.utilization, memory: g.memory }
  } catch { /* no NVIDIA GPU */ }
  return { platform: os, name: null, cores: null, utilization: null, memory: null }
}

/** Test hook: forget the cached facts. */
export const resetGpuCache = () => { profile = null }
