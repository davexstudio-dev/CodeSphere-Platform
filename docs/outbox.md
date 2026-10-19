# Outbox et Cloudflare Queues

Les événements du produit quittent le monolithe par une **table d'outbox** vidée vers **Cloudflare Queues** (ADR [0001](adr/0001-modular-monolith-first.md), ticket #259). C'est la base de la synchronisation de l'index de recherche, des notifications et du rapprochement des paiements. La base de l'edge n'a pas de transactions interactives : l'unité atomique est **une seule requête**.

## Garanties

| Garantie | Comment |
|---|---|
| Un événement est écrit **avec** le changement qu'il décrit, ou pas du tout | `outboxInsert` est une étape de la même requête (`WITH m AS (...)`, comme `withAudit`). Une mutation qui ne touche aucune ligne n'émet rien. |
| Aucun événement perdu | Le relais ne marque un événement `published_at` qu'**après** l'acceptation par la file. Un échec laisse l'événement en attente, avec un délai croissant (1 s, 2 s, 4 s… 5 min). |
| Aucun effet appliqué deux fois | La livraison est **au moins une fois** (un plantage entre l'envoi et le marquage renvoie l'événement). Les consommateurs sont idempotents (voir plus bas). |
| Deux relais ne prennent pas les mêmes événements | Réservation `FOR UPDATE SKIP LOCKED` avec un bail (`locked_until`, 60 s) : un relais mort libère ses événements à l'échéance. |
| Un événement qui échoue sans fin ne bloque pas les autres | Après 8 tentatives d'envoi : `failed_at`, jamais repris. Un consommateur qui épuise ses 6 reprises Queues : la ligne est marquée `failed_at` (le message part en file d'échec). Dans les deux cas, visible dans `outboxStatus`. |
| Un événement empoisonné ne retient pas ses voisins | Côté Bun, chaque message est livré seul : seul le fautif est reporté. Côté Cloudflare, chaque message est acquitté ou repris individuellement. |

Hors garantie : l'**ordre** est celui de création au sein d'un lot, pas entre lots ni entre consommateurs. Un consommateur lit l'état courant de l'agrégat (`aggregate_type`, `aggregate_id`) plutôt que de se fier à l'ordre ou au contenu du `payload`.

## Émettre un événement

Avec un changement (le cas normal) : ajouter une étape à `withAudit`, ou à toute requête `WITH m AS (...)`.

```ts
await withAudit(db, auditEvent, mutation /* ...returning({ id }) */, [
	outboxInsert({
		type: "organization.validated",
		aggregateType: "organization",
		aggregateIdColumn: "id", // colonne du RETURNING qui porte l'id
		payload: { decision: "validate" },
	}),
]);
```

Sans changement associé : `publishEvent(db, { type, aggregateType, aggregateId, dedupeKey })`. Avec une `dedupeKey`, émettre deux fois écrit une fois (une requête rejouée ne double pas l'événement).

Aujourd'hui émis : `organization.applied|validated|rejected|suspended|reinstated`, `job.removed`.

## Écrire un consommateur

Un consommateur est un objet `Consumer` ajouté à `packages/api/src/outbox/consumers.ts`. Deux formes :

1. **Effet atomique** (`atomic: true`) : l'effet et le marqueur `processed_events` sont écrits par **une** requête (`effectOnce`). L'effet a lieu exactement une fois, même après un plantage. À préférer quand l'effet est une écriture en base.
2. **Gestionnaire idempotent** : le marqueur est écrit après le succès du gestionnaire. Un plantage entre les deux le relance : il doit donc tolérer d'être rejoué (upsert, « mettre à », envoi avec une clé d'idempotence côté fournisseur).

### Consommateur de démonstration : `stats`

`statsConsumer` compte, dans `outbox_stats`, les événements vus par type :

```ts
export const statsConsumer: Consumer = {
	name: "stats",
	types: "*",
	atomic: true,
	async handle(message, db) {
		await effectOnce(db, "stats", message.id, (mark) => sql`
			INSERT INTO outbox_stats (type, count)
			SELECT ${message.type}, 1 FROM ${mark}
			ON CONFLICT (type) DO UPDATE SET count = outbox_stats.count + 1, updated_at = now()`);
	},
};
```

Pour le voir : valider une Organisation depuis `/admin/organizations`, attendre le relais (5 s en local, 1 min sur Cloudflare), puis `select * from outbox_stats;`. Le test `outbox.int.test.ts` rejoue l'événement deux fois et vérifie que le compteur n'avance qu'une fois.

## Où tourne le relais

| Environnement | Relais | File |
|---|---|---|
| Cloudflare (Worker) | Cron Trigger chaque minute (`scheduled`) : `drainOutbox` | Queue `codesphere-events` (binding `EVENTS`), consommée par le `queue` du même Worker (`apiQueue`), file d'échec `codesphere-events-dlq` |
| Serveur Bun, développement, tests | `startOutboxRelay` (toutes les 5 s, dans le processus ; `OUTBOX_RELAY=false` à côté du Worker sur la même base) | Locale : les événements vont directement aux consommateurs, mêmes garanties |

À créer une fois côté Cloudflare : `wrangler queues create codesphere-events` et `wrangler queues create codesphere-events-dlq`.

## Surveiller

`outboxStatus(db)` : nombre d'événements en attente, en échec définitif, et ancienneté du plus vieux en attente. Une alerte raisonnable : le plus vieux en attente depuis plus de 10 minutes, ou un échec définitif.

## Restes, sans date

- Pas d'écran d'administration de l'outbox (état, rejouer un événement en échec).
- Les consommateurs réels (index de recherche, notifications, paiements) arrivent avec leurs tickets.
- Purge des événements publiés et des marqueurs anciens.
- Le plafond d'un lot (50) et le rythme d'une minute limitent le débit : à relever si un volume l'exige.
