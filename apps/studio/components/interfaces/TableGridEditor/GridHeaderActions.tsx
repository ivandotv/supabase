import * as Tooltip from '@radix-ui/react-tooltip'
import type { PostgresTable } from '@supabase/postgres-meta'
import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useParams } from 'common'
import { Lock, MousePointer2, PlusCircle, Unlock } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button, PopoverContent_Shadcn_, PopoverTrigger_Shadcn_, Popover_Shadcn_ } from 'ui'

import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import APIDocsButton from 'components/ui/APIDocsButton'
import { useDatabasePoliciesQuery } from 'data/database-policies/database-policies-query'
import { useDatabasePublicationsQuery } from 'data/database-publications/database-publications-query'
import { useDatabasePublicationUpdateMutation } from 'data/database-publications/database-publications-update-mutation'
import { useTableUpdateMutation } from 'data/tables/table-update-mutation'
import { useCheckPermissions, useIsFeatureEnabled } from 'hooks'
import { EXCLUDED_SCHEMAS } from 'lib/constants/schemas'
import ConfirmModal from 'ui-patterns/Dialogs/ConfirmDialog'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import { RoleImpersonationPopover } from '../RoleImpersonationSelector'
import useEntityType from 'hooks/misc/useEntityType'
import { ENTITY_TYPE } from 'data/entity-types/entity-type-constants'
import { useProjectLintsQuery } from 'data/lint/lint-query'
import { TableLike } from 'hooks/misc/useTable'

export interface GridHeaderActionsProps {
  table: TableLike
  canEditViaTableEditor: boolean
}

const GridHeaderActions = ({ table }: GridHeaderActionsProps) => {
  const entityType = useEntityType(table?.id)
  const { ref } = useParams()
  const { project } = useProjectContext()

  // need project lints to get security status for views
  const { data: lints } = useProjectLintsQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })

  const isTable = entityType?.type === ENTITY_TYPE.TABLE
  const isMaterializedView = entityType?.type === ENTITY_TYPE.MATERIALIZED_VIEW
  const isView = entityType?.type === ENTITY_TYPE.VIEW

  // check if current entity is a view and has an associated security definer lint
  const viewIsSecurityDefiner =
    entityType?.type === ENTITY_TYPE.VIEW &&
    lints?.some(
      (lint) =>
        (lint?.metadata?.name === entityType.name &&
          lint?.name === 'security_definer_view' &&
          lint?.level === 'ERROR') ||
        lint?.level === 'WARN'
    )

  const isForeignTable = entityType?.type === ENTITY_TYPE.FOREIGN_TABLE

  const realtimeEnabled = useIsFeatureEnabled('realtime:all')
  const isLocked = EXCLUDED_SCHEMAS.includes(table.schema)

  const { mutate: updateTable } = useTableUpdateMutation({
    onError: (error) => {
      toast.error(`Failed to toggle RLS: ${error.message}`)
    },
    onSettled: () => {
      closeConfirmModal()
    },
  })

  const [showEnableRealtime, setShowEnableRealtime] = useState(false)
  const [open, setOpen] = useState(false)
  const [rlsConfirmModalOpen, setRlsConfirmModalOpen] = useState(false)

  const projectRef = project?.ref
  const { data } = useDatabasePoliciesQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })
  const policies = (data ?? []).filter(
    (policy) => policy.schema === table.schema && policy.table === table.name
  )

  const { data: publications } = useDatabasePublicationsQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })
  const realtimePublication = (publications ?? []).find(
    (publication) => publication.name === 'supabase_realtime'
  )
  const realtimeEnabledTables = realtimePublication?.tables ?? []
  const isRealtimeEnabled = realtimeEnabledTables.some((t: any) => t.id === table?.id)

  const { mutate: updatePublications, isLoading: isTogglingRealtime } =
    useDatabasePublicationUpdateMutation({
      onSuccess: () => {
        setShowEnableRealtime(false)
      },
      onError: (error) => {
        toast.error(`Failed to toggle realtime for ${table.name}: ${error.message}`)
      },
    })

  const canSqlWriteTables = useCheckPermissions(PermissionAction.TENANT_SQL_ADMIN_WRITE, 'tables')
  const canSqlWriteColumns = useCheckPermissions(PermissionAction.TENANT_SQL_ADMIN_WRITE, 'columns')
  const isReadOnly = !canSqlWriteTables && !canSqlWriteColumns
  // This will change when we allow autogenerated API docs for schemas other than `public`
  const doesHaveAutoGeneratedAPIDocs = table.schema === 'public'

  const toggleRealtime = async () => {
    if (!project) return console.error('Project is required')
    if (!realtimePublication) return console.error('Unable to find realtime publication')

    const exists = realtimeEnabledTables.some((x: any) => x.id == table.id)
    const tables = !exists
      ? [`${table.schema}.${table.name}`].concat(
          realtimeEnabledTables.map((t: any) => `${t.schema}.${t.name}`)
        )
      : realtimeEnabledTables
          .filter((x: any) => x.id != table.id)
          .map((x: any) => `${x.schema}.${x.name}`)

    updatePublications({
      projectRef: project?.ref,
      connectionString: project?.connectionString,
      id: realtimePublication.id,
      tables,
    })
  }

  const closeConfirmModal = () => {
    setRlsConfirmModalOpen(false)
  }
  const onToggleRLS = async () => {
    const payload = {
      id: table.id,
      rls_enabled: !(table as PostgresTable).rls_enabled,
    }

    updateTable({
      projectRef: project?.ref!,
      connectionString: project?.connectionString,
      id: payload.id,
      schema: table.schema,
      payload: payload,
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isReadOnly && (
          <Tooltip.Root delayDuration={0}>
            <Tooltip.Trigger className="w-full">
              <div className="border border-strong rounded bg-overlay-hover px-3 py-1 text-xs">
                Viewing as read-only
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom">
                <Tooltip.Arrow className="radix-tooltip-arrow" />
                <div
                  className={[
                    'rounded bg-alternative py-1 px-2 leading-none shadow',
                    'border border-background',
                  ].join(' ')}
                >
                  <span className="text-xs text-foreground">
                    You need additional permissions to manage your project's data
                  </span>
                </div>
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        )}

        {isTable ? (
          (table as PostgresTable).rls_enabled ? (
            <>
              {policies.length < 1 && !isLocked ? (
                <Tooltip.Root delayDuration={0}>
                  <Tooltip.Trigger asChild className="w-full">
                    <Button
                      asChild
                      type="default"
                      className="group"
                      icon={<PlusCircle strokeWidth={1.5} className="text-foreground-muted" />}
                    >
                      <Link
                        passHref
                        href={`/project/${projectRef}/auth/policies?search=${table.id}&schema=${table.schema}`}
                      >
                        Add RLS policy
                      </Link>
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content side="bottom">
                      <Tooltip.Arrow className="radix-tooltip-arrow" />
                      <div
                        className={[
                          'rounded bg-alternative py-1 px-2 leading-none shadow',
                          'border border-background',
                        ].join(' ')}
                      >
                        <div className="text-xs text-foreground p-1 leading-relaxed">
                          <p>RLS is enabled for this table, but no policies are set. </p>
                          <p>
                            Select queries will return an <u>empty array</u> of results.
                          </p>
                        </div>
                      </div>
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                <Button
                  asChild
                  type={policies.length < 1 && !isLocked ? 'warning' : 'default'}
                  className="group"
                  icon={
                    isLocked || policies.length > 0 ? (
                      <span className="text-right text-xs rounded-xl px-[6px] bg-foreground-lighter/30 text-brand-1100">
                        {policies.length}
                      </span>
                    ) : (
                      <PlusCircle strokeWidth={1.5} />
                    )
                  }
                >
                  <Link
                    passHref
                    href={`/project/${projectRef}/auth/policies?search=${table.id}&schema=${table.schema}`}
                  >
                    Auth {policies.length > 1 ? 'policies' : 'policy'}
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Popover_Shadcn_ open={open} onOpenChange={() => setOpen(!open)} modal={false}>
              <PopoverTrigger_Shadcn_ asChild>
                <Button type="warning" icon={<Lock strokeWidth={1.5} />}>
                  RLS disabled
                </Button>
              </PopoverTrigger_Shadcn_>
              <PopoverContent_Shadcn_ className="min-w-[395px] text-sm" align="end">
                <h3 className="flex items-center gap-2">
                  <Lock size={16} /> Row Level Security (RLS)
                </h3>
                <div className="grid gap-2 mt-4 text-foreground-light text-sm">
                  <p>
                    You can restrict and control who can read, write and update data in this table
                    using Row Level Security.
                  </p>
                  <p>
                    With RLS enabled, anonymous users will not be able to read/write data in the
                    table.
                  </p>
                  {!isLocked && (
                    <div className="mt-2">
                      <Button
                        type="default"
                        onClick={() => setRlsConfirmModalOpen(!rlsConfirmModalOpen)}
                      >
                        Enable RLS for this table
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent_Shadcn_>
            </Popover_Shadcn_>
          )
        ) : null}

        {/* need to check if view is security invoker or definer */}
        {isView && viewIsSecurityDefiner && (
          <Popover_Shadcn_ open={open} onOpenChange={() => setOpen(!open)} modal={false}>
            <PopoverTrigger_Shadcn_ asChild>
              <Button type="warning" icon={<Unlock strokeWidth={1.5} />}>
                View is public
              </Button>
            </PopoverTrigger_Shadcn_>
            <PopoverContent_Shadcn_ className="min-w-[395px] text-sm" align="end">
              <h3 className="flex items-center gap-2">
                <Unlock size={16} /> Secure your View
              </h3>
              <div className="grid gap-2 mt-4 text-foreground-light text-sm">
                <p>
                  Postgres' default setting for views is SECURITY DEFINER which means they use the
                  permissions of the view's creator, rather than the permissions of the querying
                  user when executing the view's underlying query.
                </p>
                <p>
                  Creating a view in the public schema makes that view accessible via your project's
                  APIs.
                </p>

                <div className="mt-2">
                  <Button type="default" asChild>
                    <Link
                      target="_blank"
                      href="https://supabase.com/docs/guides/database/database-advisors?lint=0010_security_definer_view"
                    >
                      Learn more
                    </Link>
                  </Button>
                </div>
              </div>
            </PopoverContent_Shadcn_>
          </Popover_Shadcn_>
        )}

        {isMaterializedView && entityType.schema === 'public' && (
          <Popover_Shadcn_ open={open} onOpenChange={() => setOpen(!open)} modal={false}>
            <PopoverTrigger_Shadcn_ asChild>
              <Button type="warning" icon={<Unlock strokeWidth={1.5} />}>
                View is public
              </Button>
            </PopoverTrigger_Shadcn_>
            <PopoverContent_Shadcn_ className="min-w-[395px] text-sm" align="end">
              <h3 className="flex items-center gap-2">
                <Unlock size={16} /> Secure your View
              </h3>
              <div className="grid gap-2 mt-4 text-foreground-light text-sm">
                <p>
                  Materialized view is in the public schema and can be queried by anon and
                  authenticated roles
                </p>

                <div className="mt-2">
                  <Button type="default" asChild>
                    <Link
                      target="_blank"
                      href="https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api"
                    >
                      Learn more
                    </Link>
                  </Button>
                </div>
              </div>
            </PopoverContent_Shadcn_>
          </Popover_Shadcn_>
        )}

        {isForeignTable && entityType.schema === 'public' && (
          <Popover_Shadcn_ open={open} onOpenChange={() => setOpen(!open)} modal={false}>
            <PopoverTrigger_Shadcn_ asChild>
              <Button type="warning" icon={<Unlock strokeWidth={1.5} />}>
                Foreign table is public
              </Button>
            </PopoverTrigger_Shadcn_>
            <PopoverContent_Shadcn_ className="min-w-[395px] text-sm" align="end">
              <h3 className="flex items-center gap-2">
                <Unlock size={16} /> Secure Foreign table
              </h3>
              <div className="grid gap-2 mt-4 text-foreground-light text-sm">
                <p>
                  Foreign tables do not enforce RLS. Move them to a private schema not exposed to
                  Postgrest or disable Postgrest.
                </p>

                <div className="mt-2">
                  <Button type="default" asChild>
                    <Link target="_blank" href="https://github.com/orgs/supabase/discussions/21647">
                      Learn more
                    </Link>
                  </Button>
                </div>
              </div>
            </PopoverContent_Shadcn_>
          </Popover_Shadcn_>
        )}

        <RoleImpersonationPopover serviceRoleLabel="postgres" />

        {isTable && realtimeEnabled && (
          <Button
            type="default"
            icon={
              <MousePointer2
                strokeWidth={1.5}
                className={isRealtimeEnabled ? 'text-brand' : 'text-foreground-muted'}
              />
            }
            onClick={() => setShowEnableRealtime(true)}
          >
            Realtime {isRealtimeEnabled ? 'on' : 'off'}
          </Button>
        )}

        {doesHaveAutoGeneratedAPIDocs && <APIDocsButton section={['entities', table.name]} />}
      </div>

      <ConfirmationModal
        visible={showEnableRealtime}
        loading={isTogglingRealtime}
        title={`${isRealtimeEnabled ? 'Disable' : 'Enable'} realtime for ${table.name}`}
        confirmLabel={`${isRealtimeEnabled ? 'Disable' : 'Enable'} realtime`}
        confirmLabelLoading={`${isRealtimeEnabled ? 'Disabling' : 'Enabling'} realtime`}
        onCancel={() => setShowEnableRealtime(false)}
        onConfirm={() => toggleRealtime()}
      >
        <div className="space-y-2">
          <p className="text-sm">
            Once realtime has been {isRealtimeEnabled ? 'disabled' : 'enabled'}, the table will{' '}
            {isRealtimeEnabled ? 'no longer ' : ''}broadcast any changes to authorized subscribers.
          </p>
          {!isRealtimeEnabled && (
            <p className="text-sm">
              You may also select which events to broadcast to subscribers on the{' '}
              <Link href={`/project/${ref}/database/publications`} className="text-brand">
                database publications
              </Link>{' '}
              settings.
            </p>
          )}
        </div>
      </ConfirmationModal>

      {entityType?.type === ENTITY_TYPE.TABLE && (
        <ConfirmModal
          danger={(table as PostgresTable).rls_enabled}
          visible={rlsConfirmModalOpen}
          title="Confirm to enable Row Level Security"
          description="Are you sure you want to enable Row Level Security for this table?"
          buttonLabel="Enable RLS"
          buttonLoadingLabel="Updating"
          onSelectCancel={closeConfirmModal}
          onSelectConfirm={onToggleRLS}
        />
      )}
    </>
  )
}

export default GridHeaderActions
