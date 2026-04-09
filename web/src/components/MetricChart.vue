<template>
  <div ref="chartEl" class="chart" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MetricPoint } from '../api/index.js'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps<{
  history: MetricPoint[]
  unit: string
  color: string
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function buildOption() {
  const times = props.history.map((p) => new Date(p.recorded_at).toLocaleTimeString('zh-CN'))
  const values = props.history.map((p) => p.value)

  return {
    backgroundColor: 'transparent',
    grid: { top: 10, right: 16, bottom: 40, left: 48 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1d2e',
      borderColor: '#2d3148',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0]
        return `${p.name}<br/><b>${p.value} ${props.unit}</b>`
      },
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#2d3148' } },
      axisLabel: { color: '#64748b', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1e2235' } },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => `${v}${props.unit}` },
    },
    dataZoom: [{ type: 'inside', start: 60, end: 100 }],
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: props.color, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: props.color + '40' },
            { offset: 1, color: props.color + '00' },
          ]),
        },
      },
    ],
  }
}

function initChart() {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas' })
  chart.setOption(buildOption())
}

watch(() => props.history, () => {
  chart?.setOption(buildOption())
})

const ro = new ResizeObserver(() => chart?.resize())

onMounted(() => {
  initChart()
  if (chartEl.value) ro.observe(chartEl.value)
})

onUnmounted(() => {
  ro.disconnect()
  chart?.dispose()
})
</script>

<style scoped>
.chart { height: 200px; width: 100%; }
</style>
