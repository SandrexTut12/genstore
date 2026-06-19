# Cloudflare Pages — გაშვების ინსტრუქცია (per-product preview)

ეს ნაბიჯები ერთხელ უნდა გააკეთო. ამის შემდეგ push-ზე ავტომატურად deploy იქნება (როგორც GitHub-ზე).

## 1. ანგარიში
- გადადი **https://dash.cloudflare.com/sign-up** და გააკეთე უფასო ანგარიში.

## 2. Pages პროექტის შექმნა
1. მენიუში: **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. ავტორიზაცია GitHub-ით, აირჩიე repo: **SandrexTut12/genstore**
3. Build settings:
   - **Framework preset:** None
   - **Build command:** (ცარიელი დატოვე)
   - **Build output directory:** `/`  (ან ცარიელი)
4. **Save and Deploy**

რამდენიმე წამში მიიღებ მისამართს: `https://genstore-XXX.pages.dev`

## 3. ტესტი
- გახსენი `https://genstore-XXX.pages.dev/` — საიტი უნდა მუშაობდეს.
- გახსენი `https://genstore-XXX.pages.dev/p/<რომელიმე-პროდუქტის-id>` — უნდა გადაგამისამართოს პროდუქტზე.
- preview შესამოწმებლად: ჩასვი `/p/<id>` ლინკი **https://developers.facebook.com/tools/debug/** -ში → უნდა გამოჩნდეს პროდუქტის ფოტო, სათაური, ფასი.

## 4. Firebase — ახალი დომენის დაშვება
- Firebase Console → **Authentication** → **Settings** → **Authorized domains** → დაამატე:
  - `genstore-XXX.pages.dev` (და მოგვიანებით შენი დომენი, მაგ. `genstore.ge`)

## 5. (არჩევითი) დომენი
- Cloudflare Pages → პროექტი → **Custom domains** → **Set up a domain** → ჩაწერე `genstore.ge` და მიჰყევი DNS ინსტრუქციას.

---

## როგორ მუშაობს (ტექნიკურად)
- `functions/p/[id].js` — crawler-ს აძლევს HTML-ს იმ პროდუქტის OG tags-ით; ნამდვილ ვიზიტორს გადაამისამართებს `/#product/<id>`-ზე.
- `functions/og-image/[id].js` — Firestore-დან იღებს base64 ფოტოს, გადააქცევს ნამდვილ სურათად og:image-ისთვის.
- share ღილაკი ავტომატურად იყენებს `/p/<id>`-ს Cloudflare-ზე, `#product/<id>`-ს GitHub Pages-ზე.
