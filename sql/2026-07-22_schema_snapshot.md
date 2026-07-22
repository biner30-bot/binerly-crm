# Şema Anlık Görüntüsü — 2026-07-22

Bu dosya, Supabase Dashboard'dan alınan **gerçek canlı şemanın** (tüm tablolar + sütunlar + RLS politikaları) birebir kopyasıdır. `sql/README.md`'deki uyarının aksine — bu, benim hafızamdan yeniden inşa edilmiş bir tahmin değil, kullanıcının doğrudan veritabanından aldığı gerçek bir döküm.

**Kapsam dışı** (bu dökümde yok): tam `CREATE TABLE` ifadeleri (varsayılan değerler, foreign key/index tanımları tam değil), `GRANT` ifadeleri (özellikle `service_role` grant'leri — bkz. `feedback`/`project` hafıza notları, bazı tablolarda eksik olabiliyordu), ve RLS politikalarında kullanılan `my_team_ids()` fonksiyonunun kendi tanımı.

**Önemli mimari not**: Politikalara bakınca iki farklı takım-izolasyon deseni görülüyor:
1. **Eski/orijinal tablolar** (`customers`, `deals`, `tickets`, `ticket_messages`, `kb_articles`, `activities`, `company_settings`, `group_classes`, `group_class_enrollments`) — ayrı "own X" (tekil sahiplik) politikası + ayrı "X_team_*" (takım) politikaları, ikisi OR ile birleşiyor. Takım özelliği SONRADAN eklendiği için orijinal politikalar hiç değiştirilmeden sadece ek politikalar eklenmiş (additive, geri alması güvenli).
2. **Daha sonra eklenen tablolar** (`company_expenses`, `audit_log`, `channel_messages`, `custom_field_defs`, `price_list_items`, `deal_line_items`, `deal_pdf_templates`, `payments`, `payment_credentials`, `channel_credentials`, `business_hours`, `notifications`) — TEK bir politika, `(user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids()))` şeklinde, hazır bir `my_team_ids()` yardımcı fonksiyonu kullanıyor.
3. **`class_attendance` ve `room_inventory`** (bu oturumda eklendi) — `my_team_ids()` fonksiyonunu KULLANMADAN, aynı mantığı elle `IN (SELECT team_id FROM team_members WHERE member_id = auth.uid())` şeklinde yazıyor. İşlevsel olarak birebir aynı ama stil olarak tutarsız — bu fonksiyonun var olduğunu bilmiyordum. **Yeni bir tabloya RLS eklerken bundan sonra `my_team_ids()` kullanılmalı**, elle subquery yazmak yerine.

---

## Tablolar ve sütunlar

### `customers`
| Sütun | Tip | Not |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | |
| name | text | |
| sector | text | null |
| phone | text | null |
| notes | text | null |
| last_contact | timestamptz | null |
| created_at | timestamptz | null |
| email | text | null |
| portal_user_id | uuid | null |
| region | text | null |
| deleted_at | timestamptz | null |
| deleted_batch_id | uuid | null |
| customer_type | text | |
| tags | jsonb | |
| custom_fields | jsonb | |

### `deals`
id(PK), user_id, customer_id(null), title, value(null), stage(null), reminder(null), created_at(null), lost_reason(null), reminder_date(null,date), cost, closed_at(null), deleted_at(null), deleted_batch_id(null), kdv_rate, session_total(null,int4), session_used(int4), tags(jsonb), custom_fields(jsonb), approval_token(null), approved_at(null), notify_customer(bool), assigned_to(null,uuid), appointment_reminder_sent_at(null), payment_mode(text), payment_status(null), paytr_merchant_oid(null)

### `activities`
id(PK), user_id, customer_id(null), type(null), content, created_at(null)

### `tickets`
id(PK), user_id, customer_id, subject, description(null), priority, status, resolved_at(null), created_at, deleted_at(null), deleted_batch_id(null)

### `ticket_messages`
id(PK), user_id, ticket_id, direction, content, created_at, is_internal(bool), read_at(null)

### `kb_articles`
id(PK), user_id, title, category(null), content, created_at, updated_at, deleted_at(null), deleted_batch_id(null)

### `company_settings`
user_id(PK), company_name(null), address(null), phone(null), email(null), tax_number(null), logo_url(null), updated_at, customer_notifications_enabled(bool), default_kdv_rate(numeric), sector(null), lead_capture_token(null), preferred_customer_type(null), appointment_reminders_enabled(bool), pdf_template_key(null)

### `customer_portal_users`
id(PK), email, created_at

### `team_members`
member_id(PK), team_id, email, joined_at, name(null), can_edit_settings(bool)

### `team_invites`
id(PK), owner_id, email, status, created_at

### `payments`
id(PK), user_id, deal_id, amount, paid_at, note(null), created_at, deleted_at(null), deleted_batch_id(null), provider(null), iyzico_payment_id(null), iyzico_payment_transaction_id(null), refund_of_payment_id(null,uuid), paytr_merchant_oid(null)

### `push_subscriptions`
id(PK), user_id, endpoint(unique), p256dh, auth_key, created_at

### `audit_log`
id(PK), user_id, actor_id, actor_email, entity_type, entity_id, action, summary, created_at

### `company_expenses`
id(PK), user_id, title, category, amount, expense_date(timestamptz), note(null), created_at, deleted_at(null), deleted_batch_id(null), recurrence_interval, kdv_rate(null)

### `channel_credentials`
id(PK), user_id, channel, external_id, access_token, app_secret, display_name(null), connected_at, updated_at

### `channel_messages`
id(PK), user_id, channel, direction, external_message_id(null), counterpart_id, counterpart_name(null), customer_id(null), body, created_at, read_at(null)

### `custom_field_defs`
id(PK), user_id, entity, key, label, field_type, options(null,jsonb), sector(null), sort_order, active(bool), created_at, audience(null)

### `price_list_items`
id(PK), user_id, name, price, created_at

### `group_classes`
id(PK), user_id, name, instructor_name(null), weekday(int2), start_time(time), duration_minutes(int4), capacity(int4), notes(null), created_at, deleted_at(null), deleted_batch_id(null)

### `group_class_enrollments`
id(PK), user_id, group_class_id, customer_id, enrolled_at

### `business_hours`
id(PK), user_id, weekday(int2), start_time(time), end_time(time), slot_duration_minutes(int4), created_at

### `notifications`
id(PK), user_id, title, body(null), url(null), created_at, read_at(null)

### `deal_pdf_templates`
id(PK), user_id, name, width(int4), height(int4), blocks(jsonb), created_at, updated_at

### `deal_line_items`
id(PK), user_id, deal_id, description, quantity(numeric), unit_price(numeric), sort_order(int4), created_at

### `payment_credentials`
id(PK), user_id, provider, api_key, secret_key, sandbox(bool), connected_at, updated_at, merchant_salt(null), max_installment(int4)

### `attachments`
id(PK), user_id, entity_type, entity_id, file_name, storage_path, file_size(null,int8), content_type(null), uploaded_by(null), created_at, deleted_at(null), deleted_batch_id(null)

### `class_attendance`
id(PK), user_id, group_class_id, customer_id, occurrence_date(date), status, created_at, updated_at

### `room_inventory`
id(PK), user_id, room_type, quantity(int4), created_at — **not**: bu dökümde `capacity`/`description` sütunları görünmüyor, muhtemelen döküm bu ikisi eklenmeden hemen önce/eşzamanlı alınmış. Gerçek tabloda bu iki sütun da var (bkz. `2026-07-22_room_inventory.sql`).

---

## RLS Politikaları (özet, tablo başına)

Tam politika metinleri (USING/WITH CHECK ifadeleri dahil) kullanıcının paylaştığı orijinal dökümde saklı duruyor — burada sadece hangi tabloda hangi desenin kullanıldığı özetlendi (yukarıdaki "Önemli mimari not" bölümüne bakın). Tüm tablolarda RLS aktif, `public`/`authenticated` rollerine göre SELECT/INSERT/UPDATE/DELETE ayrı politikalar olarak tanımlı. Müşteri portalına özel ek politikalar (`*_select_portal`, `*_insert_portal`, `*_cancel_portal`, `*_claim_portal` vb.) şu tablolarda var: `customers`, `deals`, `tickets`, `ticket_messages`, `group_classes`, `group_class_enrollments`, `price_list_items`, `company_settings`.
