'use client'

import { useTranslations } from 'next-intl'
import type { RenderNode } from '@/features/agenda/group-rows'
import { BreakoutRow } from './breakout-row'
import { EditorRow, SortableRow, type RowContext } from './editor-row'
import { TrackColumn } from './track-column'

/**
 * A breakout in the editor: its head, its strand columns, and the ordinary
 * block rows inside them.
 *
 * Every row here is the same `EditorRow` the day uses, so a block in a strand
 * has the fields, the delete and the details panel a block anywhere else has.
 */
export function EditorBreakout({
  node,
  ctx,
}: {
  node: Extract<RenderNode, { kind: 'breakout' }>
  ctx: RowContext
}) {
  const t = useTranslations('agenda')
  const entry = ctx.schedule.entries.get(node.id)
  if (!entry) return null

  const blockCount = node.strands.reduce(
    (sum, strand) => sum + strand.rows.filter((r) => r.kind === 'module').length,
    0,
  )
  const agenda = ctx.agenda

  return (
    <SortableRow id={node.id} label={node.cluster.title} nested={false}>
      {(chrome) => (
        <BreakoutRow
          cluster={node.cluster}
          entry={entry}
          trackCount={node.strands.length}
          blockCount={blockCount}
          chrome={{
            ...chrome,
            isDropTarget: ctx.projectedParent === node.id,
            presence: ctx.presenceByBlock.get(node.id),
          }}
          editing={{
            onPinChange: (pinnedStartMinute) => agenda.patchCluster(node.id, { pinnedStartMinute }),
            onTitleChange: (title) => agenda.patchCluster(node.id, { title }),
            onColorChange: (color) => agenda.patchCluster(node.id, { color }),
            autoFocusTitle: node.id === ctx.newClusterId,
            onRemove: () => agenda.removeModule(node.id),
            onAddTrack: () =>
              agenda.addCluster({
                title: `${t('breakout.newTrackTitle')} ${node.strands.length + 1}`,
                parentId: node.id,
              }),
          }}
        >
          {node.strands.map((strand, index) => {
            const strandEntry = ctx.schedule.entries.get(strand.id)
            if (!strandEntry) return null
            const blocks = strand.rows.filter((r) => r.kind === 'module')

            return (
              <SortableRow key={strand.id} id={strand.id} label={strand.cluster.title} nested>
                {(strandChrome) => (
                  <TrackColumn
                    cluster={strand.cluster}
                    entry={strandEntry}
                    index={index}
                    count={node.strands.length}
                    blockCount={blocks.length}
                    chrome={{
                      ...strandChrome,
                      isDropTarget: ctx.projectedParent === strand.id,
                      presence: ctx.presenceByBlock.get(strand.id),
                    }}
                    editing={{
                      onTitleChange: (title) => agenda.patchCluster(strand.id, { title }),
                      onColorChange: (color) => agenda.patchCluster(strand.id, { color }),
                      autoFocusTitle: strand.id === ctx.newClusterId,
                      onRemove: () => agenda.removeModule(strand.id),
                      types: Object.values(agenda.doc.moduleTypes),
                      onAddBlock: (typeKey) => {
                        const type = Object.values(agenda.doc.moduleTypes).find(
                          (candidate) => candidate.key === typeKey,
                        )
                        if (!type) return
                        agenda.addModule({
                          moduleTypeId: type.id,
                          title: type.name,
                          durationMinutes: type.defaultDurationMinutes,
                          clusterId: strand.id,
                        })
                      },
                    }}
                  >
                    {strand.rows.map((row) => (
                      // Same row component as the day, told to stack rather
                      // than to lay itself out on the six-column grid.
                      <EditorRow key={row.id} row={row} ctx={{ ...ctx, layout: 'stack' }} />
                    ))}
                  </TrackColumn>
                )}
              </SortableRow>
            )
          })}
        </BreakoutRow>
      )}
    </SortableRow>
  )
}
