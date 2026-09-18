-- ═══════════════════════════════════════════════════════════════════════════
-- Cloud only. The invoice document, so a customer can download its own.
--
-- The PDF is fetched from the accounting system by the billing worker and kept
-- here. Three reasons for keeping rather than linking:
--
--   * A link into the accounting system's portal only opens for somebody who
--     can sign in there, or carries a token that works for anybody who gets
--     hold of it. Neither is what "my invoices" should mean.
--   * The web container has no access to the accounting system, and this is
--     not a good reason to give it one.
--   * What was sent to the customer is what they should be able to download
--     later, even after the invoice has been changed or the article renamed.
--
-- Row level security decides whose invoice is whose: a tenant reads the rows
-- carrying its own id and cannot express a query that returns another's.
-- ═══════════════════════════════════════════════════════════════════════════

create table invoice_document (
  tenant_id uuid not null,
  month date not null check (extract(day from month) = 1),
  filename text not null,
  content bytea not null,
  byte_size integer not null check (byte_size > 0),
  fetched_at timestamptz not null default now(),
  primary key (tenant_id, month)
);

alter table invoice_document owner to gw_owner;
alter table invoice_document enable row level security;
alter table invoice_document force row level security;

-- Read only, and only its own: the document is written by the worker, which
-- runs as gw_ops.
create policy invoice_document_tenant on invoice_document
  for select to gw_app using (tenant_id = app.current_tenant());

grant select on invoice_document to gw_app;
grant select, insert, delete on invoice_document to gw_ops;
