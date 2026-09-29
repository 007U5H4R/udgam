// Loading state of the batch builder: the same skeleton list as /admin/batches (technical-plan §11).
// The detail route has no loading boundary, so another org's batch answers a real 404 (EVAL-080).
export { default } from '../(list)/loading';
