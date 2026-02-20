import { InMemoryStream } from './in-memory-stream'
import { runDurableStreamContractTests } from './stream.contract.test'

runDurableStreamContractTests('InMemoryStream contract', <T>() => new InMemoryStream<T>())
