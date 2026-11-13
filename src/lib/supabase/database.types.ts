
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"id": string,"metadata": NonNullable<Json>,"resource_id": string | null,"resource_type": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"resource_id"?: string | null,"resource_type": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"resource_id"?: string | null,"resource_type"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"display_order": number,"id": string,"is_active": boolean,"name": string,"parent_id": string | null,"slug": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_active"?: boolean,"name": string,"parent_id"?: string | null,"slug": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_id"?: string | null,"slug"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"category_attributes": {
                  Row: {
                    "attribute_key": string,"attribute_name": string,"attribute_type": string,"category_id": string,"display_order": number,"id": string,"is_required": boolean,"options": NonNullable<Json>,"show_in_title": boolean,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attribute_key": string,"attribute_name": string,"attribute_type"?: string,"category_id": string,"display_order"?: number,"id"?: string,"is_required"?: boolean,"options"?: NonNullable<Json>,"show_in_title"?: boolean,"unit"?: string | null
                  }
                  Update: {
                    "attribute_key"?: string,"attribute_name"?: string,"attribute_type"?: string,"category_id"?: string,"display_order"?: number,"id"?: string,"is_required"?: boolean,"options"?: NonNullable<Json>,"show_in_title"?: boolean,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_attributes_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_messages": {
                  Row: {
                    "created_at": string,"email": string,"handled_at": string | null,"id": string,"message": string,"name": string,"subject": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"handled_at"?: string | null,"id"?: string,"message": string,"name": string,"subject": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"handled_at"?: string | null,"id"?: string,"message"?: string,"name"?: string,"subject"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string,"id": string,"listing_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"generation_job_items": {
                  Row: {
                    "attempts": number,"created_at": string,"error_message": string | null,"id": string,"input": NonNullable<Json>,"job_id": string,"listing_id": string | null,"locked_at": string | null,"product_id": string | null,"row_number": number,"status": string,"system_error": boolean,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error_message"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"job_id": string,"listing_id"?: string | null,"locked_at"?: string | null,"product_id"?: string | null,"row_number": number,"status"?: string,"system_error"?: boolean,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error_message"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"job_id"?: string,"listing_id"?: string | null,"locked_at"?: string | null,"product_id"?: string | null,"row_number"?: number,"status"?: string,"system_error"?: boolean,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generation_job_items_job_id_workspace_id_fkey"
      columns: ["job_id","workspace_id"]
isOneToOne: false
      referencedRelation: "generation_jobs"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "generation_job_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generation_job_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generation_job_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"generation_jobs": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"created_by": string | null,"failed_items": number,"id": string,"options": NonNullable<Json>,"processed_items": number,"retry_count": number,"source_filename": string | null,"source_path": string | null,"started_at": string | null,"status": string,"successful_items": number,"total_items": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"failed_items"?: number,"id"?: string,"options"?: NonNullable<Json>,"processed_items"?: number,"retry_count"?: number,"source_filename"?: string | null,"source_path"?: string | null,"started_at"?: string | null,"status"?: string,"successful_items"?: number,"total_items"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"failed_items"?: number,"id"?: string,"options"?: NonNullable<Json>,"processed_items"?: number,"retry_count"?: number,"source_filename"?: string | null,"source_path"?: string | null,"started_at"?: string | null,"status"?: string,"successful_items"?: number,"total_items"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generation_jobs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generation_jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_versions": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"created_by": string | null,"description": string,"generation_method": string,"id": string,"listing_id": string,"platform": string,"short_description": string,"title": string,"version_number": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string,"generation_method"?: string,"id"?: string,"listing_id": string,"platform"?: string,"short_description"?: string,"title": string,"version_number": number,"workspace_id": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string,"generation_method"?: string,"id"?: string,"listing_id"?: string,"platform"?: string,"short_description"?: string,"title"?: string,"version_number"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_versions_listing_id_workspace_id_fkey"
      columns: ["listing_id","workspace_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "listing_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "condition_info": string,"created_at": string,"created_by": string | null,"cta": string,"current_version": number,"description": string,"generation_method": string,"highlights": NonNullable<Json>,"id": string,"keywords": NonNullable<Json>,"language": string,"platform": string,"product_id": string,"selling_points": NonNullable<Json>,"short_description": string,"status": string,"template_id": string | null,"title": string,"tone": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "condition_info"?: string,"created_at"?: string,"created_by"?: string | null,"cta"?: string,"current_version"?: number,"description"?: string,"generation_method"?: string,"highlights"?: NonNullable<Json>,"id"?: string,"keywords"?: NonNullable<Json>,"language"?: string,"platform"?: string,"product_id": string,"selling_points"?: NonNullable<Json>,"short_description"?: string,"status"?: string,"template_id"?: string | null,"title": string,"tone"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "condition_info"?: string,"created_at"?: string,"created_by"?: string | null,"cta"?: string,"current_version"?: number,"description"?: string,"generation_method"?: string,"highlights"?: NonNullable<Json>,"id"?: string,"keywords"?: NonNullable<Json>,"language"?: string,"platform"?: string,"product_id"?: string,"selling_points"?: NonNullable<Json>,"short_description"?: string,"status"?: string,"template_id"?: string | null,"title"?: string,"tone"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_product_id_workspace_id_fkey"
      columns: ["product_id","workspace_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "listings_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "code": string,"created_at": string,"currency": string,"display_order": number,"features": NonNullable<Json>,"id": string,"is_active": boolean,"monthly_bulk_limit": number,"monthly_listing_limit": number,"name": string,"price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"currency"?: string,"display_order"?: number,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"monthly_bulk_limit"?: number,"monthly_listing_limit": number,"name": string,"price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"currency"?: string,"display_order"?: number,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"monthly_bulk_limit"?: number,"monthly_listing_limit"?: number,"name"?: string,"price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"product_images": {
                  Row: {
                    "created_at": string,"display_order": number,"filename": string,"id": string,"mime_type": string,"product_id": string,"size": number,"storage_path": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_order"?: number,"filename": string,"id"?: string,"mime_type": string,"product_id": string,"size": number,"storage_path": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_order"?: number,"filename"?: string,"id"?: string,"mime_type"?: string,"product_id"?: string,"size"?: number,"storage_path"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_workspace_id_fkey"
      columns: ["product_id","workspace_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "product_images_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "archived_at": string | null,"attributes": NonNullable<Json>,"brand": string | null,"category_id": string | null,"condition": string,"condition_custom": string | null,"cost_price": number | null,"created_at": string,"created_by": string | null,"currency": string,"defects": string,"description": string,"features": NonNullable<Json>,"id": string,"location": string | null,"model": string | null,"name": string,"price": number | null,"sku": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"attributes"?: NonNullable<Json>,"brand"?: string | null,"category_id"?: string | null,"condition"?: string,"condition_custom"?: string | null,"cost_price"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"defects"?: string,"description"?: string,"features"?: NonNullable<Json>,"id"?: string,"location"?: string | null,"model"?: string | null,"name": string,"price"?: number | null,"sku"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"attributes"?: NonNullable<Json>,"brand"?: string | null,"category_id"?: string | null,"condition"?: string,"condition_custom"?: string | null,"cost_price"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"defects"?: string,"description"?: string,"features"?: NonNullable<Json>,"id"?: string,"location"?: string | null,"model"?: string | null,"name"?: string,"price"?: number | null,"sku"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"disabled_at": string | null,"disabled_reason": string | null,"email": string,"full_name": string,"id": string,"onboarding_completed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"disabled_reason"?: string | null,"email": string,"full_name"?: string,"id": string,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"disabled_reason"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_buckets": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_events": {
                  Row: {
                    "error_message": string | null,"id": string,"processed_at": string | null,"received_at": string,"status": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error_message"?: string | null,"id": string,"processed_at"?: string | null,"received_at"?: string,"status"?: string,"type": string
                  }
                  Update: {
                    "error_message"?: string | null,"id"?: string,"processed_at"?: string | null,"received_at"?: string,"status"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"id": string,"plan_id": string,"provider": string,"provider_customer_id": string | null,"provider_subscription_id": string | null,"status": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan_id": string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan_id"?: string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"templates": {
                  Row: {
                    "category_id": string | null,"configuration": NonNullable<Json>,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"name": string,"platform": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"configuration"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"platform"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"configuration"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"platform"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "templates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_records": {
                  Row: {
                    "created_at": string,"id": string,"idempotency_key": string,"metadata": NonNullable<Json>,"operation_type": string,"quantity": number,"refund_of": string | null,"status": string,"user_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"idempotency_key": string,"metadata"?: NonNullable<Json>,"operation_type": string,"quantity": number,"refund_of"?: string | null,"status"?: string,"user_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"idempotency_key"?: string,"metadata"?: NonNullable<Json>,"operation_type"?: string,"quantity"?: number,"refund_of"?: string | null,"status"?: string,"user_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_records_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_records_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_invitations": {
                  Row: {
                    "created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"role": string,"token": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role"?: string,"token"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role"?: string,"token"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"id": string,"role": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"role"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"can_edit_workspace":
{ Args: { "p_workspace": string }; Returns: boolean
                           },
"can_manage_workspace":
{ Args: { "p_workspace": string }; Returns: boolean
                           },
"can_process_job":
{ Args: { "p_job": string }; Returns: boolean
                           },
"category_is_usable":
{ Args: { "p_category": string,"p_workspace": string }; Returns: boolean
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"claim_job_items":
{ Args: { "p_job": string,"p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"error_message": string | null,
"id": string,
"input": NonNullable<Json>,
"job_id": string,
"listing_id": string | null,
"locked_at": string | null,
"product_id": string | null,
"row_number": number,
"status": string,
"system_error": boolean,
"updated_at": string,
"workspace_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "generation_job_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"consume_usage":
{ Args: { "p_idempotency_key": string,"p_metadata"?: Json,"p_operation": string,"p_workspace": string }; Returns: Json
                           },
"create_generation_job":
{ Args: { "p_filename": string,"p_items": Json,"p_options": Json,"p_source_path": string,"p_workspace": string }; Returns: Json
                           },
"current_user_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"decline_invitation":
{ Args: { "p_token": string }; Returns: boolean
                           },
"get_dashboard_stats":
{ Args: { "p_workspace": string }; Returns: Json
                           },
"get_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"get_usage_summary":
{ Args: { "p_workspace": string }; Returns: Json
                           },
"invite_member":
{ Args: { "p_email": string,"p_role": string,"p_workspace": string }; Returns: Json
                           },
"is_service_role":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "p_workspace": string }; Returns: boolean
                           },
"log_audit_event":
{ Args: { "p_action": string,"p_metadata"?: Json,"p_resource_id"?: string,"p_resource_type": string,"p_workspace": string }; Returns: undefined
                           },
"my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "expires_at": string,"invited_by_name": string,"role": string,"token": string,"workspace_name": string
            }[]
                           },
"refresh_generation_job":
{ Args: { "p_job": string }; Returns: {
              "completed_at": string | null,
"created_at": string,
"created_by": string | null,
"failed_items": number,
"id": string,
"options": NonNullable<Json>,
"processed_items": number,
"retry_count": number,
"source_filename": string | null,
"source_path": string | null,
"started_at": string | null,
"status": string,
"successful_items": number,
"total_items": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "generation_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"refund_usage":
{ Args: { "p_idempotency_key": string,"p_workspace": string }; Returns: boolean
                           },
"remove_member":
{ Args: { "p_user": string,"p_workspace": string }; Returns: Json
                           },
"report_job_item":
{ Args: { "p_error"?: string,"p_item": string,"p_listing"?: string,"p_product"?: string,"p_status": string,"p_system_error"?: boolean }; Returns: undefined
                           },
"retry_failed_job_items":
{ Args: { "p_job": string }; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation": string }; Returns: boolean
                           },
"set_member_role":
{ Args: { "p_role": string,"p_user": string,"p_workspace": string }; Returns: Json
                           },
"shares_workspace_with":
{ Args: { "p_user": string }; Returns: boolean
                           },
"submit_contact_message":
{ Args: { "p_email": string,"p_message": string,"p_name": string,"p_subject": string }; Returns: string
                           },
"try_uuid":
{ Args: { "p_value": string }; Returns: string
                           },
"workspace_member_limit":
{ Args: { "p_workspace": string }; Returns: number
                           },
"workspace_plan":
{ Args: { "p_workspace": string }; Returns: {
              "code": string,
"created_at": string,
"currency": string,
"display_order": number,
"features": NonNullable<Json>,
"id": string,
"is_active": boolean,
"monthly_bulk_limit": number,
"monthly_listing_limit": number,
"name": string,
"price": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "plans"
        isOneToOne: true
        isSetofReturn: false
      } },
"workspace_usage_period":
{ Args: { "p_workspace": string }; Returns: {
              "period_end": string,"period_start": string
            }[]
                           },
"workspace_usage_state":
{ Args: { "p_workspace": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
