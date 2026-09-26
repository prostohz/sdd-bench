import { parseMethodology } from './methodology-content.js'

const articleClass = [
  'col-[4/-1] max-w-[850px] min-w-0 text-[15px] leading-[1.78] text-[#34463a] max-[760px]:text-sm',
  '[&_h2]:scroll-mt-[30px] [&_h2]:mb-[21px] [&_h2]:border-t [&_h2]:border-[#dce4d9] [&_h2]:pt-[46px] [&_h2]:font-serif [&_h2]:text-[clamp(28px,3vw,37px)] [&_h2]:leading-[1.22] [&_h2]:font-extrabold [&_h2]:tracking-[-0.05em] [&_h2]:text-ink',
  '[&_h2:first-of-type]:border-t-0 [&_h2:first-of-type]:pt-0 [&_h2:not(:first-of-type)]:mt-[54px] max-[760px]:[&_h2]:text-[29px]',
  '[&_p]:mb-5 [&_ul]:mb-6 [&_ul]:pl-[22px] [&_li]:my-[5px] [&_li]:pl-1 [&_li::marker]:text-green-2',
  '[&_a]:text-green [&_a]:underline [&_a]:underline-offset-[3px]',
  '[&_code]:rounded-[3px] [&_code]:bg-[#e8eee5] [&_code]:px-[5px] [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.86em] [&_code]:leading-[normal] [&_code]:text-[#245940]',
  '[&_pre]:my-[26px] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border-0 [&_pre]:bg-green [&_pre]:px-[27px] [&_pre]:py-[23px] [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-[1.8] [&_pre]:text-[#eef8ed]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_pre_code]:[font:inherit]',
  '[&_table]:mt-[25px] [&_table]:mb-[31px] [&_table]:w-full [&_table]:min-w-0 [&_table]:border [&_table]:border-line [&_table]:border-collapse [&_table]:bg-paper [&_table]:text-left [&_table]:text-[13px] [&_table]:leading-[1.55] [&_table]:tabular-nums [&_table_thead]:bg-[#edf1e9]',
  '[&_table_th]:border-b [&_table_th]:border-line [&_table_th]:px-[15px] [&_table_th]:py-[13px] [&_table_th]:align-top [&_table_th]:[overflow-wrap:anywhere] [&_table_th]:text-[11px] [&_table_th]:leading-[normal] [&_table_th]:font-semibold [&_table_th]:tracking-[0.03em] [&_table_th]:text-[#56705b] [&_table_th]:uppercase [&_table_th]:whitespace-normal',
  '[&_table_td]:border-b [&_table_td]:border-line [&_table_td]:px-[15px] [&_table_td]:py-[13px] [&_table_td]:align-top [&_table_td]:[overflow-wrap:anywhere] [&_table_td:first-child]:font-semibold [&_table_td:first-child]:text-ink [&_table_tbody_tr:last-child>*]:border-b-0',
].join(' ')

export function MethodologyBody({ source }: { source: string }) {
  const { contents, article } = parseMethodology(source)
  return (
    <main id="top" className="overflow-visible">
      <div className="mx-auto grid w-[var(--page-width)] grid-cols-12 gap-x-6 gap-y-11 pt-[72px] pb-[110px] max-[760px]:block max-[760px]:pt-[47px] max-[760px]:pb-[75px]">
        <aside className="col-span-3" aria-label="On this page">
          <div className="sticky top-[30px] max-[760px]:static max-[760px]:mb-[58px]">
            <ul
              className="mb-7 flex list-none flex-col border-t border-line p-0 [&_li]:border-b [&_li]:border-line [&_a]:block [&_a]:py-3 [&_a]:text-xs [&_a]:leading-[1.45] [&_a]:font-semibold [&_a]:text-[#53675a] [&_a:hover]:text-green-2 [&_a:focus-visible]:text-green-2 max-[760px]:grid max-[760px]:grid-cols-2 max-[760px]:gap-x-[22px] max-[430px]:grid-cols-1"
              dangerouslySetInnerHTML={{ __html: contents }}
            />
          </div>
        </aside>
        <article
          className={articleClass}
          dangerouslySetInnerHTML={{ __html: article }}
        />
      </div>
    </main>
  )
}
